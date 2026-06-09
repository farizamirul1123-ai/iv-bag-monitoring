#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include "HX711.h"
#include <math.h>

// ============================================================
// IV MONITORING ESP32 - PATIENT 2
// AUTO RAW TO ML + NOISE FILTER + SLOW FLOW + BLOCKAGE DETECTION
//
// Features:
// 1. Dashboard update every 1 second
// 2. Auto detect initial volume
// 3. Prevent displayed IV volume from increasing due to noise
// 4. Deadband filter for small fluctuation
// 5. 30-second average flow analysis
// 6. Detect Normal Flow / Slow Flow / Blockage / Bag Empty
// ============================================================

// ===============================
// 1. WIFI SETTING
// ===============================
const char* WIFI_SSID = "Fariz’s iPhone";
const char* WIFI_PASSWORD = "09876555";

const char* SERVER_URL = "https://iv-bag-monitoring.onrender.com/api/update";
const char* API_KEY = "IVMONITOR123";

// PATIENT 2
const int PATIENT_ID = 2;

// ===============================
// 2. HX711 PIN
// ===============================
#define HX711_DOUT_PIN 4
#define HX711_SCK_PIN 5

HX711 scale;

// ============================================================
// 3. PATIENT 2 RAW CALIBRATION
// ============================================================
// Based on Patient 2 raw test.
// Jika bacaan ml terlalu tinggi/rendah, adjust dua value ini sahaja.
//
// Bacaan terlalu tinggi  -> naikkan COUNTS_PER_ML
// Bacaan terlalu rendah -> turunkan COUNTS_PER_ML
// ============================================================

const long RAW_EMPTY = 436100;        // raw reading masa hampir kosong
const float COUNTS_PER_ML = 448.0;    // count per 1 ml

const float MAX_CAPACITY_ML = 500.0;

// Untuk Patient 2: raw tinggi bila bag penuh, raw turun bila air berkurang.
const bool RAW_HIGHER_WHEN_FULL = true;

// ===============================
// 4. AUTO DETECT SETTING
// ===============================
bool bagStarted = false;

float initialCapacityMl = 0.0;
float lastStableVolume = 0.0;

int stableCount = 0;
float lastDetectVolume = 0.0;

const float BAG_DETECT_THRESHOLD_ML = 10.0;
const int STABLE_COUNT_LIMIT = 3;
const float STABLE_TOLERANCE_ML = 8.0;

// ===============================
// 5. DISPLAY NOISE FILTER SETTING
// ===============================
// Bila valve tutup, bacaan raw boleh naik turun sikit.
// Filter ini elak display jadi 466 -> 467 -> 468 -> 470.

const float VOLUME_DEADBAND_ML = 2.0;       // perubahan kecil bawah 2 ml dianggap noise
const bool PREVENT_VOLUME_INCREASE = true;  // IV volume tidak boleh naik semula

// Smoothing:
// 0.30 = smooth kuat tapi lambat
// 0.55 = cepat tapi masih stabil untuk dashboard
const float SMOOTHING_ALPHA = 0.55;

// HX711 average sample:
// 3 = cepat, 5 = stabil, 8 = lebih stabil tapi lambat
const int HX711_AVG_SAMPLES = 5;

// ===============================
// 6. SLOW FLOW + BLOCKAGE SETTING
// ===============================
// Flow status dikira menggunakan average dalam 30 saat.
// Ini lebih stabil daripada check setiap 1 saat.
//
// Untuk demo:
// - Valve buka normal      -> Normal Flow
// - Valve tutup separuh    -> Slow Flow
// - Valve tutup penuh      -> Blockage selepas 30 saat

const unsigned long FLOW_CHECK_WINDOW_MS = 30000;  // 30 seconds

// Jika average flow <= 0.5 ml/min, dianggap no flow / blockage.
const float BLOCKAGE_MAX_FLOW_ML_MIN = 0.5;

// Jika average flow > 0.5 dan <= 6.0 ml/min, dianggap slow flow.
// Kalau terlalu cepat detect slow flow, turunkan nilai ini.
// Kalau susah detect slow flow, naikkan nilai ini.
const float SLOW_FLOW_MAX_ML_MIN = 6.0;

float flowWindowStartVolume = 0.0;
unsigned long flowWindowStartTime = 0;
float averageFlowRateMlMin = 0.0;

bool slowFlowDetected = false;
bool blockageDetected = false;
String flowStatusText = "Checking";

// ===============================
// 7. TIMING
// ===============================
unsigned long lastSerialTime = 0;
unsigned long lastSendTime = 0;
unsigned long lastWifiRetryTime = 0;

const unsigned long SERIAL_INTERVAL_MS = 1000;
const unsigned long SEND_INTERVAL_MS = 1000;
const unsigned long WIFI_RETRY_INTERVAL_MS = 5000;

// ===============================
// 8. INSTANT FLOW CALCULATION
// ===============================
// Instant flow hanya untuk Serial Monitor. Dashboard guna average flow.
float lastFlowVolume = 0.0;
unsigned long lastFlowTime = 0;
float instantFlowRateMlMin = 0.0;

// ===============================
// 9. ALERT HARDWARE
// ===============================
#define ALERT_BUZZER_PIN 18
#define ALERT_LED_PIN 2

bool ENABLE_HARDWARE_ALERT = true;
int lastNotifiedQuarter = -1;

const int ALERT_BEEP_MS = 130;
const int ALERT_GAP_MS = 120;

unsigned long lastFlowAlertBeepTime = 0;
const unsigned long FLOW_ALERT_BEEP_INTERVAL_MS = 10000;

// ===============================
// FUNCTION DECLARATION
// ===============================
void connectWiFiQuick();
bool readRawAverage(long &rawValue);
float rawToMl(long rawValue);
float clampVolume(float value);
float applyVolumeNoiseFilter(float currentVolume);
float calculateInstantFlowRate(float currentVolume);
void updateFlowCondition(float currentVolume);
int getQuarterLevel(float volumeMl);
void notifyQuarterIfChanged(float volumeMl);
void beepOnce();
void beepFlowAlert();
void sendDataToServer(float volumeMl);
void resetBagDetection();

// ===============================
// 10. WIFI FUNCTION
// ===============================
void connectWiFiQuick() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  Serial.println();
  Serial.print("Connecting to WiFi: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int retry = 0;

  while (WiFi.status() != WL_CONNECTED && retry < 12) {
    delay(250);
    Serial.print(".");
    retry++;
  }

  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("WiFi connected.");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("WiFi not connected. Will retry later.");
  }
}

// ===============================
// 11. READ RAW
// ===============================
bool readRawAverage(long &rawValue) {
  if (!scale.is_ready()) {
    return false;
  }

  rawValue = scale.read_average(HX711_AVG_SAMPLES);
  return true;
}

// ===============================
// 12. RAW TO ML
// ===============================
float rawToMl(long rawValue) {
  float volumeMl;

  if (RAW_HIGHER_WHEN_FULL) {
    volumeMl = ((float)rawValue - (float)RAW_EMPTY) / COUNTS_PER_ML;
  } else {
    volumeMl = ((float)RAW_EMPTY - (float)rawValue) / COUNTS_PER_ML;
  }

  if (volumeMl < 0.0) {
    volumeMl = 0.0;
  }

  if (volumeMl > MAX_CAPACITY_ML) {
    volumeMl = MAX_CAPACITY_ML;
  }

  return volumeMl;
}

// ===============================
// 13. CLAMP VOLUME
// ===============================
float clampVolume(float value) {
  if (value < 0.0) {
    return 0.0;
  }

  if (bagStarted && initialCapacityMl > 0.0 && value > initialCapacityMl) {
    return initialCapacityMl;
  }

  if (value > MAX_CAPACITY_ML) {
    return MAX_CAPACITY_ML;
  }

  return value;
}

// ===============================
// 14. DISPLAY NOISE FILTER
// ===============================
float applyVolumeNoiseFilter(float currentVolume) {
  currentVolume = clampVolume(currentVolume);

  // Jangan benarkan display volume naik semula.
  if (PREVENT_VOLUME_INCREASE && currentVolume > lastStableVolume) {
    currentVolume = lastStableVolume;
  }

  float diff = fabs(currentVolume - lastStableVolume);

  // Kalau beza kecil, anggap noise.
  if (diff <= VOLUME_DEADBAND_ML) {
    currentVolume = lastStableVolume;
  }

  float finalVolume = (lastStableVolume * (1.0 - SMOOTHING_ALPHA)) +
                      (currentVolume * SMOOTHING_ALPHA);

  finalVolume = clampVolume(finalVolume);

  // Safety: selepas smoothing pun jangan bagi naik.
  if (PREVENT_VOLUME_INCREASE && finalVolume > lastStableVolume) {
    finalVolume = lastStableVolume;
  }

  return finalVolume;
}

// ===============================
// 15. INSTANT FLOW RATE
// ===============================
float calculateInstantFlowRate(float currentVolume) {
  unsigned long now = millis();

  if (lastFlowTime == 0) {
    lastFlowTime = now;
    lastFlowVolume = currentVolume;
    return 0.0;
  }

  float timeDiffMin = (now - lastFlowTime) / 60000.0;

  if (timeDiffMin <= 0.0) {
    return instantFlowRateMlMin;
  }

  float volumeDrop = lastFlowVolume - currentVolume;

  if (volumeDrop < 0.0) {
    volumeDrop = 0.0;
  }

  if (volumeDrop < 0.3) {
    volumeDrop = 0.0;
  }

  instantFlowRateMlMin = volumeDrop / timeDiffMin;

  if (instantFlowRateMlMin > 999.0) {
    instantFlowRateMlMin = 999.0;
  }

  lastFlowVolume = currentVolume;
  lastFlowTime = now;

  return instantFlowRateMlMin;
}

// ===============================
// 16. 30-SECOND FLOW CONDITION
// ===============================
void updateFlowCondition(float currentVolume) {
  if (!bagStarted) {
    flowWindowStartTime = 0;
    flowWindowStartVolume = 0.0;
    averageFlowRateMlMin = 0.0;
    slowFlowDetected = false;
    blockageDetected = false;
    flowStatusText = "Waiting";
    return;
  }

  // Jika hampir kosong, jangan classify slow/blockage.
  if (currentVolume <= 20.0) {
    flowWindowStartTime = 0;
    flowWindowStartVolume = currentVolume;
    averageFlowRateMlMin = 0.0;
    slowFlowDetected = false;
    blockageDetected = false;
    flowStatusText = "Bag Empty";
    return;
  }

  unsigned long now = millis();

  if (flowWindowStartTime == 0) {
    flowWindowStartTime = now;
    flowWindowStartVolume = currentVolume;
    averageFlowRateMlMin = 0.0;
    slowFlowDetected = false;
    blockageDetected = false;
    flowStatusText = "Checking";
    return;
  }

  if (now - flowWindowStartTime >= FLOW_CHECK_WINDOW_MS) {
    float volumeDrop = flowWindowStartVolume - currentVolume;

    if (volumeDrop < 0.0) {
      volumeDrop = 0.0;
    }

    float timeMin = (now - flowWindowStartTime) / 60000.0;

    if (timeMin > 0.0) {
      averageFlowRateMlMin = volumeDrop / timeMin;
    } else {
      averageFlowRateMlMin = 0.0;
    }

    if (averageFlowRateMlMin <= BLOCKAGE_MAX_FLOW_ML_MIN) {
      blockageDetected = true;
      slowFlowDetected = false;
      flowStatusText = "Blockage";
    } else if (averageFlowRateMlMin <= SLOW_FLOW_MAX_ML_MIN) {
      blockageDetected = false;
      slowFlowDetected = true;
      flowStatusText = "Slow Flow";
    } else {
      blockageDetected = false;
      slowFlowDetected = false;
      flowStatusText = "Normal Flow";
    }

    // Start next 30-second window.
    flowWindowStartTime = now;
    flowWindowStartVolume = currentVolume;
  }
}

// ===============================
// 17. QUARTER LEVEL
// ===============================
int getQuarterLevel(float volumeMl) {
  if (!bagStarted || initialCapacityMl <= 0.0) {
    return 0;
  }

  if (volumeMl <= 0.5) {
    return 0;
  }

  float quarterVolume = initialCapacityMl / 4.0;

  int quarter = (int)ceil(volumeMl / quarterVolume);

  if (quarter < 1) {
    quarter = 1;
  }

  if (quarter > 4) {
    quarter = 4;
  }

  return quarter;
}

// ===============================
// 18. ALERT FUNCTION
// ===============================
void beepOnce() {
  if (!ENABLE_HARDWARE_ALERT) {
    return;
  }

  digitalWrite(ALERT_LED_PIN, HIGH);
  tone(ALERT_BUZZER_PIN, 1500);
  delay(ALERT_BEEP_MS);

  noTone(ALERT_BUZZER_PIN);
  digitalWrite(ALERT_LED_PIN, LOW);
  delay(ALERT_GAP_MS);
}

void beepFlowAlert() {
  if (!ENABLE_HARDWARE_ALERT) {
    return;
  }

  unsigned long now = millis();

  if (now - lastFlowAlertBeepTime < FLOW_ALERT_BEEP_INTERVAL_MS) {
    return;
  }

  lastFlowAlertBeepTime = now;

  if (blockageDetected) {
    Serial.println("BLOCKAGE ALERT BEEP");
    // 2 kali beep untuk blockage
    for (int i = 0; i < 2; i++) {
      digitalWrite(ALERT_LED_PIN, HIGH);
      tone(ALERT_BUZZER_PIN, 2000);
      delay(180);
      noTone(ALERT_BUZZER_PIN);
      digitalWrite(ALERT_LED_PIN, LOW);
      delay(150);
    }
  } else if (slowFlowDetected) {
    Serial.println("SLOW FLOW ALERT BEEP");
    // 1 beep pendek untuk slow flow
    digitalWrite(ALERT_LED_PIN, HIGH);
    tone(ALERT_BUZZER_PIN, 1200);
    delay(160);
    noTone(ALERT_BUZZER_PIN);
    digitalWrite(ALERT_LED_PIN, LOW);
  }
}

void notifyQuarterIfChanged(float volumeMl) {
  if (!bagStarted) {
    return;
  }

  int quarter = getQuarterLevel(volumeMl);

  if (lastNotifiedQuarter < 0) {
    lastNotifiedQuarter = quarter;
    return;
  }

  if (quarter == lastNotifiedQuarter) {
    return;
  }

  lastNotifiedQuarter = quarter;

  if (quarter <= 0) {
    Serial.println("Quarter notification: 0/4, bag empty.");
    return;
  }

  Serial.print("Quarter notification: ");
  Serial.print(quarter);
  Serial.println("/4");

  for (int i = 0; i < quarter; i++) {
    beepOnce();
  }
}

// ===============================
// 19. SEND DATA TO SERVER
// ===============================
void sendDataToServer(float volumeMl) {
  if (WiFi.status() != WL_CONNECTED) {
    unsigned long now = millis();

    if (now - lastWifiRetryTime >= WIFI_RETRY_INTERVAL_MS) {
      Serial.println("WiFi not connected. Retrying...");
      connectWiFiQuick();
      lastWifiRetryTime = now;
    }

    return;
  }

  HTTPClient http;
  WiFiClientSecure secureClient;

  secureClient.setInsecure();

  http.setTimeout(1500);
  http.begin(secureClient, SERVER_URL);
  http.addHeader("Content-Type", "application/json");

  float remainingMl = clampVolume(volumeMl);
  int quarterLevel = getQuarterLevel(remainingMl);

  float capacityToSend;

  if (bagStarted && initialCapacityMl > 0.0) {
    capacityToSend = initialCapacityMl;
  } else {
    capacityToSend = MAX_CAPACITY_ML;
  }

  String jsonPayload = "{";
  jsonPayload += "\"api_key\":\"" + String(API_KEY) + "\",";
  jsonPayload += "\"patient_id\":" + String(PATIENT_ID) + ",";
  jsonPayload += "\"weight_g\":" + String(remainingMl, 2) + ",";
  jsonPayload += "\"remaining_ml\":" + String(remainingMl, 2) + ",";
  jsonPayload += "\"capacity_ml\":" + String(capacityToSend, 2) + ",";
  jsonPayload += "\"quarter_level\":" + String(quarterLevel) + ",";
  jsonPayload += "\"flow_rate_ml_min\":" + String(averageFlowRateMlMin, 2) + ",";
  jsonPayload += "\"instant_flow_rate_ml_min\":" + String(instantFlowRateMlMin, 2) + ",";
  jsonPayload += "\"slow_flow_alert\":" + String(slowFlowDetected ? "true" : "false") + ",";
  jsonPayload += "\"blockage_alert\":" + String(blockageDetected ? "true" : "false") + ",";
  jsonPayload += "\"flow_status\":\"" + flowStatusText + "\",";
  jsonPayload += "\"sensor_mode\":\"patient2_slow_flow_blockage\"";
  jsonPayload += "}";

  Serial.println();
  Serial.println("Sending to dashboard:");
  Serial.println(jsonPayload);

  int httpResponseCode = http.POST(jsonPayload);

  Serial.print("HTTP Response Code: ");
  Serial.println(httpResponseCode);

  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.println("Server response:");
    Serial.println(response);
  } else {
    Serial.println("Server timeout / send failed.");
  }

  http.end();
}

// ===============================
// 20. RESET BAG DETECTION
// ===============================
void resetBagDetection() {
  Serial.println();
  Serial.println("Reset bag detection.");
  Serial.println("Remove old bag, then place new bag.");

  bagStarted = false;
  stableCount = 0;
  lastDetectVolume = 0.0;

  initialCapacityMl = 0.0;
  lastStableVolume = 0.0;

  lastFlowVolume = 0.0;
  lastFlowTime = 0;
  instantFlowRateMlMin = 0.0;

  flowWindowStartTime = 0;
  flowWindowStartVolume = 0.0;
  averageFlowRateMlMin = 0.0;
  slowFlowDetected = false;
  blockageDetected = false;
  flowStatusText = "Checking";

  lastFlowAlertBeepTime = 0;
  lastNotifiedQuarter = -1;
}

// ===============================
// 21. SETUP
// ===============================
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("==================================");
  Serial.println("IV Monitoring Started");
  Serial.println("Device: PATIENT 2");
  Serial.println("Mode: Slow Flow + Blockage Detection");
  Serial.println("Dashboard: 1 second update");
  Serial.println("==================================");

  pinMode(ALERT_LED_PIN, OUTPUT);
  pinMode(ALERT_BUZZER_PIN, OUTPUT);

  digitalWrite(ALERT_LED_PIN, LOW);
  digitalWrite(ALERT_BUZZER_PIN, LOW);

  scale.begin(HX711_DOUT_PIN, HX711_SCK_PIN);
  scale.power_up();

  delay(1000);

  if (scale.is_ready()) {
    Serial.println("HX711 detected successfully.");
  } else {
    Serial.println("HX711 not ready at startup. Check wiring.");
  }

  Serial.println();
  Serial.println("Patient 2 calibration:");
  Serial.print("RAW_EMPTY: ");
  Serial.println(RAW_EMPTY);
  Serial.print("COUNTS_PER_ML: ");
  Serial.println(COUNTS_PER_ML, 2);

  Serial.println();
  Serial.println("How to use:");
  Serial.println("1. Gantung IV bag Patient 2.");
  Serial.println("2. System auto detects initial volume.");
  Serial.println("3. Dashboard updates every 1 second.");
  Serial.println("4. Press R in Serial Monitor to reset bag detection.");
  Serial.println("5. Valve separuh tutup -> Slow Flow after 30 seconds.");
  Serial.println("6. Valve tutup penuh -> Blockage after 30 seconds.");
  Serial.println();

  connectWiFiQuick();

  lastSerialTime = millis();
  lastSendTime = millis();
}

// ===============================
// 22. LOOP
// ===============================
void loop() {
  unsigned long now = millis();

  // Serial command
  if (Serial.available() > 0) {
    char command = Serial.read();

    if (command == 'R' || command == 'r') {
      resetBagDetection();
    }
  }

  bool needSerial = (now - lastSerialTime >= SERIAL_INTERVAL_MS);
  bool needSend = (now - lastSendTime >= SEND_INTERVAL_MS);

  if (!needSerial && !needSend) {
    return;
  }

  long currentRaw = 0;

  if (!readRawAverage(currentRaw)) {
    if (needSerial) {
      Serial.println();
      Serial.println("HX711 not ready. No fake zero sent.");
      lastSerialTime = now;
    }

    if (needSend) {
      lastSendTime = now;
    }

    return;
  }

  float rawConvertedVolume = rawToMl(currentRaw);

  // ============================================================
  // AUTO DETECT INITIAL VOLUME
  // ============================================================
  if (!bagStarted) {
    if (rawConvertedVolume >= BAG_DETECT_THRESHOLD_ML) {
      float diff = fabs(rawConvertedVolume - lastDetectVolume);

      if (lastDetectVolume <= 0.0 || diff <= STABLE_TOLERANCE_ML) {
        stableCount++;
      } else {
        stableCount = 1;
      }

      lastDetectVolume = rawConvertedVolume;

      if (needSerial) {
        Serial.println();
        Serial.println("Bag detected...");
        Serial.print("Raw: ");
        Serial.println(currentRaw);

        Serial.print("Detected volume: ");
        Serial.print(rawConvertedVolume, 2);
        Serial.println(" ml");

        Serial.print("Stable count: ");
        Serial.print(stableCount);
        Serial.print("/");
        Serial.println(STABLE_COUNT_LIMIT);
      }

      if (stableCount >= STABLE_COUNT_LIMIT) {
        initialCapacityMl = rawConvertedVolume;
        lastStableVolume = rawConvertedVolume;

        lastFlowVolume = rawConvertedVolume;
        lastFlowTime = millis();
        instantFlowRateMlMin = 0.0;

        flowWindowStartTime = 0;
        flowWindowStartVolume = rawConvertedVolume;
        averageFlowRateMlMin = 0.0;
        slowFlowDetected = false;
        blockageDetected = false;
        flowStatusText = "Checking";

        bagStarted = true;
        lastNotifiedQuarter = -1;

        Serial.println();
        Serial.println("==================================");
        Serial.println("INITIAL VOLUME CAPTURED");
        Serial.print("Initial capacity detected: ");
        Serial.print(initialCapacityMl, 2);
        Serial.println(" ml");
        Serial.println("Monitoring started.");
        Serial.println("==================================");
      }
    } else {
      stableCount = 0;
      lastDetectVolume = 0.0;

      if (needSerial) {
        Serial.println();
        Serial.println("Waiting for bag...");
        Serial.print("Raw: ");
        Serial.println(currentRaw);
        Serial.print("Volume: ");
        Serial.print(rawConvertedVolume, 2);
        Serial.println(" ml");
      }
    }

    lastSerialTime = now;
    lastSendTime = now;
    return;
  }

  // ============================================================
  // AFTER INITIAL VOLUME CAPTURED
  // ============================================================

  rawConvertedVolume = clampVolume(rawConvertedVolume);

  float finalVolume = applyVolumeNoiseFilter(rawConvertedVolume);
  lastStableVolume = finalVolume;

  float instantFlow = calculateInstantFlowRate(finalVolume);

  // Slow flow and blockage detection using 30-second average.
  updateFlowCondition(finalVolume);

  notifyQuarterIfChanged(finalVolume);

  if (slowFlowDetected || blockageDetected) {
    beepFlowAlert();
  }

  if (needSerial) {
    Serial.println();
    Serial.println("----- PATIENT 2 LOAD CELL -----");
    Serial.print("Raw: ");
    Serial.println(currentRaw);

    Serial.print("Initial Capacity: ");
    Serial.print(initialCapacityMl, 2);
    Serial.println(" ml");

    Serial.print("Raw Converted Volume: ");
    Serial.print(rawConvertedVolume, 2);
    Serial.println(" ml");

    Serial.print("Filtered Remaining Volume: ");
    Serial.print(finalVolume, 2);
    Serial.println(" ml");

    Serial.print("Instant Flow Rate: ");
    Serial.print(instantFlow, 2);
    Serial.println(" ml/min");

    Serial.print("30s Average Flow Rate: ");
    Serial.print(averageFlowRateMlMin, 2);
    Serial.println(" ml/min");

    Serial.print("Flow Status: ");
    Serial.println(flowStatusText);

    Serial.print("Slow Flow Alert: ");
    Serial.println(slowFlowDetected ? "YES" : "NO");

    Serial.print("Blockage Alert: ");
    Serial.println(blockageDetected ? "YES" : "NO");

    Serial.print("Quarter Balance: ");
    Serial.print(getQuarterLevel(finalVolume));
    Serial.println("/4");

    Serial.println("--------------------------------");

    lastSerialTime = now;
  }

  if (needSend) {
    sendDataToServer(finalVolume);
    lastSendTime = now;
  }
}
