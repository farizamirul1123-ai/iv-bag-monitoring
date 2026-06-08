#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include "HX711.h"
#include <math.h>

// ============================================================
// IV MONITORING ESP32 - FARIZ / PATIENT 1
// LOAD CELL ONLY VERSION
// FAST DASHBOARD UPDATE VERSION
// Capacity: 500 ml
// Send interval: 1 second
// ============================================================

// ===============================
// 1. WIFI SETTING
// ===============================
const char* WIFI_SSID = "Fariz’s iPhone";
const char* WIFI_PASSWORD = "09876555";

const char* SERVER_URL = "https://iv-bag-monitoring.onrender.com/api/update";
const char* API_KEY = "IVMONITOR123";

// FARIZ = Patient 1
const int PATIENT_ID = 1;

// ===============================
// 2. HX711 LOAD CELL PIN
// ===============================
#define HX711_DOUT_PIN 4
#define HX711_SCK_PIN 5

HX711 scale;

// ============================================================
// 3. RAW CALIBRATION SETTING
// ============================================================
// RAW_AT_FULL  = raw reading masa IV bag penuh 500 ml
// RAW_AT_EMPTY = raw reading masa IV bag kosong 0 ml
//
// Berdasarkan reading semasa awak:
// 500 ml lebih kurang 2003551
// 0 ml masih anggaran. Kalau dapat raw kosong sebenar, tukar nilai RAW_AT_EMPTY.
// ============================================================

const long RAW_AT_FULL = 2003551;   // 500 ml
const long RAW_AT_EMPTY = 787899;   // 0 ml, anggaran

const float IV_CAPACITY_ML = 500.0;
const float QUARTER_VOLUME_ML = IV_CAPACITY_ML / 4.0;

// ===============================
// 4. SPEED + FILTER SETTING
// ===============================

// Average sample kecil = dashboard lebih cepat
const int HX711_AVERAGE_SAMPLES = 5;

// Smoothing
// 0.20 = lebih smooth tapi lambat follow
// 0.50 = lebih cepat follow perubahan
const float SMOOTHING_ALPHA = 0.50;

float lastStableVolume = 0.0;
bool firstReading = true;

// Debug serial
bool SHOW_DEBUG = true;

// Flow calculation
float lastFlowVolume = 0.0;
unsigned long lastFlowTime = 0;
float currentFlowRateMlMin = 0.0;

// ===============================
// 5. ALERT HARDWARE
// ===============================
#define ALERT_BUZZER_PIN 18
#define ALERT_LED_PIN 2

bool ENABLE_HARDWARE_ALERT = true;
int lastNotifiedQuarter = -1;

const int ALERT_BEEP_MS = 130;
const int ALERT_GAP_MS = 120;

// ===============================
// 6. TIMING
// ===============================
// Dashboard sudah awak ubah JS kepada 1000 ms.
// Jadi ESP32 pun hantar setiap 1000 ms.
unsigned long lastSendTime = 0;
unsigned long lastSerialTime = 0;

const unsigned long SEND_INTERVAL_MS = 1000;    // hantar ke dashboard setiap 1 saat
const unsigned long SERIAL_INTERVAL_MS = 1000;  // serial monitor setiap 1 saat

// Function declaration
void connectWiFi();
float clampVolume(float value);
float rawToVolumeMl(long rawValue);
float readVolumeMl();
float calculateFlowRate(float currentVolume);
int getQuarterLevel(float volumeMl);
void notifyQuarterIfChanged(float volumeMl);
void beepOnce();
void sendDataToServer(float volumeMl);

// ===============================
// 7. WIFI FUNCTION
// ===============================
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  Serial.println();
  Serial.print("Connecting to WiFi: ");
  Serial.println(WIFI_SSID);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int retry = 0;

  while (WiFi.status() != WL_CONNECTED && retry < 20) {
    delay(300);
    Serial.print(".");
    retry++;
  }

  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("WiFi connected successfully.");
    Serial.print("ESP32 IP Address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("WiFi connection failed. ESP32 will retry later.");
  }
}

// ===============================
// 8. VOLUME CLAMP
// ===============================
float clampVolume(float value) {
  if (value < 0.0) {
    return 0.0;
  }

  if (value > IV_CAPACITY_ML) {
    return IV_CAPACITY_ML;
  }

  return value;
}

// ===============================
// 9. RAW TO ML CONVERSION
// ===============================
float rawToVolumeMl(long rawValue) {
  float rawFull = (float)RAW_AT_FULL;
  float rawEmpty = (float)RAW_AT_EMPTY;
  float rawRange = rawFull - rawEmpty;

  if (rawRange == 0.0) {
    return 0.0;
  }

  float volume = ((float)rawValue - rawEmpty) * IV_CAPACITY_ML / rawRange;

  return clampVolume(volume);
}

// ===============================
// 10. READ LOAD CELL VOLUME
// ===============================
float readVolumeMl() {
  if (!scale.is_ready()) {
    Serial.println("HX711 not ready. Using last stable volume.");
    return lastStableVolume;
  }

  long rawReading = scale.read_average(HX711_AVERAGE_SAMPLES);
  float currentVolume = rawToVolumeMl(rawReading);

  float finalVolume;

  if (firstReading) {
    finalVolume = currentVolume;
    firstReading = false;
  } else {
    finalVolume = (lastStableVolume * (1.0 - SMOOTHING_ALPHA)) +
                  (currentVolume * SMOOTHING_ALPHA);
  }

  finalVolume = clampVolume(finalVolume);
  lastStableVolume = finalVolume;

  if (SHOW_DEBUG) {
    Serial.println();
    Serial.println("========== LOAD CELL FAST DEBUG ==========");
    Serial.print("Raw Average: ");
    Serial.println(rawReading);

    Serial.print("Converted Volume: ");
    Serial.print(currentVolume, 2);
    Serial.println(" ml");

    Serial.print("Final Smoothed Volume: ");
    Serial.print(finalVolume, 2);
    Serial.println(" ml");

    Serial.println("==========================================");
  }

  return finalVolume;
}

// ===============================
// 11. FLOW RATE FUNCTION
// ===============================
float calculateFlowRate(float currentVolume) {
  unsigned long now = millis();

  if (lastFlowTime == 0) {
    lastFlowTime = now;
    lastFlowVolume = currentVolume;
    return 0.0;
  }

  float timeDiffMin = (now - lastFlowTime) / 60000.0;

  if (timeDiffMin <= 0.0) {
    return currentFlowRateMlMin;
  }

  float volumeDrop = lastFlowVolume - currentVolume;

  if (volumeDrop < 0.0) {
    volumeDrop = 0.0;
  }

  if (volumeDrop < 0.5) {
    volumeDrop = 0.0;
  }

  currentFlowRateMlMin = volumeDrop / timeDiffMin;

  if (currentFlowRateMlMin > 999.0) {
    currentFlowRateMlMin = 999.0;
  }

  lastFlowVolume = currentVolume;
  lastFlowTime = now;

  return currentFlowRateMlMin;
}

// ===============================
// 12. QUARTER LEVEL FUNCTION
// ===============================
int getQuarterLevel(float volumeMl) {
  volumeMl = clampVolume(volumeMl);

  if (volumeMl <= 0.5) {
    return 0;
  }

  int quarter = (int)ceil(volumeMl / QUARTER_VOLUME_ML);

  if (quarter < 1) {
    quarter = 1;
  }

  if (quarter > 4) {
    quarter = 4;
  }

  return quarter;
}

// ===============================
// 13. BUZZER / LED ALERT
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

void notifyQuarterIfChanged(float volumeMl) {
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
    Serial.println("Quarter notification: 0/4, IV empty/no load.");
    return;
  }

  Serial.print("Quarter notification: ");
  Serial.print(quarter);
  Serial.print("/4 balance, ");
  Serial.print(quarter);
  Serial.println(" beep/blink notification.");

  for (int i = 0; i < quarter; i++) {
    beepOnce();
  }
}

// ===============================
// 14. SEND DATA TO SERVER
// ===============================
void sendDataToServer(float volumeMl) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected. Data not sent.");
    connectWiFi();
    return;
  }

  HTTPClient http;
  WiFiClientSecure secureClient;

  secureClient.setInsecure();

  // Lebih pendek = tak tunggu lama kalau server slow
  http.setTimeout(1200);

  http.begin(secureClient, SERVER_URL);
  http.addHeader("Content-Type", "application/json");

  float remainingMl = clampVolume(volumeMl);
  int quarterLevel = getQuarterLevel(remainingMl);

  String jsonPayload = "{";
  jsonPayload += "\"api_key\":\"" + String(API_KEY) + "\",";
  jsonPayload += "\"patient_id\":" + String(PATIENT_ID) + ",";
  jsonPayload += "\"weight_g\":" + String(remainingMl, 2) + ",";
  jsonPayload += "\"remaining_ml\":" + String(remainingMl, 2) + ",";
  jsonPayload += "\"capacity_ml\":" + String(IV_CAPACITY_ML, 0) + ",";
  jsonPayload += "\"quarter_level\":" + String(quarterLevel) + ",";
  jsonPayload += "\"sensor_mode\":\"load_cell_raw_500ml_fast\"";
  jsonPayload += "}";

  Serial.println();
  Serial.println("Sending data to dashboard:");
  Serial.println(jsonPayload);

  int httpResponseCode = http.POST(jsonPayload);

  Serial.print("HTTP Response Code: ");
  Serial.println(httpResponseCode);

  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.println("Server response:");
    Serial.println(response);
  } else {
    Serial.println("Failed to send data or server timeout.");
  }

  http.end();
}

// ===============================
// 15. SETUP
// ===============================
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("==================================");
  Serial.println("IV Bag Monitoring ESP32 Started");
  Serial.println("Device: FARIZ / PATIENT 1");
  Serial.println("Mode: FAST Raw HX711 to ML");
  Serial.println("Capacity: 500 ml");
  Serial.println("Send Interval: 1 second");
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
    Serial.println("HX711 not detected. Check DT, SCK, VCC and GND.");
  }

  Serial.println();
  Serial.println("IMPORTANT:");
  Serial.println("This code uses RAW calibration.");
  Serial.println("Do NOT tare.");
  Serial.println("Make sure load cell position is same as calibration test.");
  Serial.print("500 ml raw = ");
  Serial.println(RAW_AT_FULL);
  Serial.print("0 ml raw   = ");
  Serial.println(RAW_AT_EMPTY);

  connectWiFi();

  lastSendTime = millis();
  lastSerialTime = millis();
}

// ===============================
// 16. LOOP
// ===============================
void loop() {
  unsigned long now = millis();

  bool needSerial = (now - lastSerialTime >= SERIAL_INTERVAL_MS);
  bool needSend = (now - lastSendTime >= SEND_INTERVAL_MS);

  // Baca load cell sekali sahaja untuk serial + dashboard.
  // Ini lebih laju daripada baca dua kali.
  if (needSerial || needSend) {
    float currentVolume = readVolumeMl();
    float flowRate = calculateFlowRate(currentVolume);

    notifyQuarterIfChanged(currentVolume);

    if (needSerial) {
      Serial.println();
      Serial.println("----- Current Load Cell Reading -----");
      Serial.print("Patient ID: ");
      Serial.println(PATIENT_ID);

      Serial.print("Remaining Volume: ");
      Serial.print(currentVolume, 2);
      Serial.println(" ml");

      Serial.print("Flow Rate Estimate: ");
      Serial.print(flowRate, 2);
      Serial.println(" ml/min");

      Serial.print("Quarter Balance: ");
      Serial.print(getQuarterLevel(currentVolume));
      Serial.println("/4");

      Serial.println("Drop sensor: Not used");
      Serial.println("-------------------------------------");

      lastSerialTime = now;
    }

    if (needSend) {
      sendDataToServer(currentVolume);
      lastSendTime = now;
    }
  }
}
