#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include "HX711.h"
#include <math.h>

// ============================================================
// IV MONITORING ESP32 - LOAD CELL ONLY VERSION
// Sensor used: HX711 + load cell sahaja.
// Drop/drip detector sudah dibuang. Dashboard akan anggar flow
// berdasarkan trend berat load cell yang turun dari masa ke masa.
// ============================================================

// ===============================
// 1. WIFI SETTING
// ===============================
const char* WIFI_SSID = "Fariz’s iPhone";
const char* WIFI_PASSWORD = "09876555";

const char* SERVER_URL = "https://iv-bag-monitoring.onrender.com/api/update";
const char* API_KEY = "IVMONITOR123";

// Untuk Patient 1 guna 1, Patient 2 guna 2
const int PATIENT_ID = 2;

// ===============================
// 2. HX711 LOAD CELL PIN
// ===============================
#define HX711_DOUT_PIN 4
#define HX711_SCK_PIN 5

HX711 scale;

// 1kg load cell adjusted calibration factor.
float CALIBRATION_FACTOR = -526.64;

// Kalau bacaan jadi negatif, cuba tukar false kepada true.
bool REVERSE_WEIGHT_SIGN = false;

// true = tare masa mula. Pastikan load cell kosong ketika boot/reset.
// Kalau IV bag sudah tergantung sebelum ESP32 ON, tukar kepada false.
bool AUTO_TARE_ON_START = true;

// IV bag limit untuk dashboard: 500 ml = 500 g.
const float IV_CAPACITY_ML = 500.0;
const float QUARTER_VOLUME_ML = IV_CAPACITY_ML / 4.0;

// Optional hardware alert. Dashboard tetap ada sound + AI voice walaupun buzzer ini tidak dipasang.
#define ALERT_BUZZER_PIN 18
#define ALERT_LED_PIN 2
bool ENABLE_HARDWARE_ALERT = true;
int lastNotifiedQuarter = -1;
const int ALERT_BEEP_MS = 130;
const int ALERT_GAP_MS = 120;

// ===============================
// 3. TIMING
// ===============================
unsigned long lastSendTime = 0;
unsigned long lastSerialTime = 0;

const unsigned long SEND_INTERVAL_MS = 5000;    // hantar ke Render setiap 5 saat
const unsigned long SERIAL_INTERVAL_MS = 2000;  // print serial setiap 2 saat

// Function declarations.
float clampIVVolume(float value);
int getQuarterLevel(float weightGrams);
void notifyQuarterIfChanged(float weightGrams);
float readWeightGrams();
void connectWiFi();
void sendDataToServer(float weightGrams);

// ===============================
// 4. WIFI
// ===============================
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.println();
  Serial.print("Connecting to WiFi: ");
  Serial.println(WIFI_SSID);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int retry = 0;
  while (WiFi.status() != WL_CONNECTED && retry < 30) {
    delay(500);
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
// 5. LOAD CELL
// ===============================
float clampIVVolume(float value) {
  if (value < 0.0) return 0.0;
  if (value > IV_CAPACITY_ML) return IV_CAPACITY_ML;
  return value;
}

float readWeightGrams() {
  // Website mesti ikut Serial Monitor. Kalau HX711 tidak ready, hantar 0.00 g.
  if (!scale.is_ready()) {
    Serial.println("HX711 not ready. Reading sent as 0.00 g.");
    return 0.0;
  }

  float weight = scale.get_units(5);

  if (REVERSE_WEIGHT_SIGN) {
    weight = -weight;
  }

  // Buang noise kecil sekitar kosong.
  if (abs(weight) < 2.0) {
    weight = 0.0;
  }

  if (weight < 0.0) {
    weight = 0.0;
  }

  return clampIVVolume(weight);
}

// ===============================
// 6. QUARTER NOTIFICATION HARDWARE
// ===============================
int getQuarterLevel(float weightGrams) {
  float volumeMl = clampIVVolume(weightGrams);
  if (volumeMl <= 0.5) return 0;
  int quarter = (int)ceil(volumeMl / QUARTER_VOLUME_ML);
  if (quarter < 1) quarter = 1;
  if (quarter > 4) quarter = 4;
  return quarter;
}

void beepOnce() {
  if (!ENABLE_HARDWARE_ALERT) return;
  digitalWrite(ALERT_LED_PIN, HIGH);
  tone(ALERT_BUZZER_PIN, 1500);
  delay(ALERT_BEEP_MS);
  noTone(ALERT_BUZZER_PIN);
  digitalWrite(ALERT_LED_PIN, LOW);
  delay(ALERT_GAP_MS);
}

void notifyQuarterIfChanged(float weightGrams) {
  int quarter = getQuarterLevel(weightGrams);

  // First reading jadi baseline supaya ESP32 tidak beep masa startup.
  if (lastNotifiedQuarter < 0) {
    lastNotifiedQuarter = quarter;
    return;
  }

  if (quarter == lastNotifiedQuarter) return;

  lastNotifiedQuarter = quarter;

  if (quarter <= 0) {
    Serial.println("Quarter notification: 0/4, IV empty/no load. Dashboard critical alarm active.");
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
// 7. SEND DATA
// ===============================
void sendDataToServer(float weightGrams) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected. Data not sent.");
    connectWiFi();
    return;
  }

  HTTPClient http;
  WiFiClientSecure secureClient;
  secureClient.setInsecure();

  http.setTimeout(3000);
  http.begin(secureClient, SERVER_URL);
  http.addHeader("Content-Type", "application/json");

  float remainingMl = clampIVVolume(weightGrams);
  int quarterLevel = getQuarterLevel(weightGrams);

  String jsonPayload = "{";
  jsonPayload += "\"api_key\":\"" + String(API_KEY) + "\",";
  jsonPayload += "\"patient_id\":" + String(PATIENT_ID) + ",";
  jsonPayload += "\"weight_g\":" + String(weightGrams, 2) + ",";
  jsonPayload += "\"remaining_ml\":" + String(remainingMl, 2) + ",";
  jsonPayload += "\"capacity_ml\":" + String(IV_CAPACITY_ML, 0) + ",";
  jsonPayload += "\"quarter_level\":" + String(quarterLevel) + ",";
  jsonPayload += "\"sensor_mode\":\"load_cell_only\"";
  jsonPayload += "}";

  Serial.println();
  Serial.println("Sending load-cell data to server:");
  Serial.println(jsonPayload);
  Serial.print("Weight sent to website: ");
  Serial.print(weightGrams, 2);
  Serial.println(" g / ml");

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
// 8. SETUP
// ===============================
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("==================================");
  Serial.println("IV Bag Monitoring ESP32 Started");
  Serial.println("Mode: Load Cell Only");
  Serial.println("Dashboard estimates flow using weight trend.");
  Serial.println("==================================");

  pinMode(ALERT_LED_PIN, OUTPUT);
  pinMode(ALERT_BUZZER_PIN, OUTPUT);
  digitalWrite(ALERT_LED_PIN, LOW);
  digitalWrite(ALERT_BUZZER_PIN, LOW);

  scale.begin(HX711_DOUT_PIN, HX711_SCK_PIN);
  scale.set_scale(CALIBRATION_FACTOR);
  scale.power_up();

  if (AUTO_TARE_ON_START) {
    Serial.println("Taring load cell...");
    Serial.println("Pastikan tiada beban pada load cell.");
    delay(2000);
    scale.tare();
    Serial.println("Tare completed.");
  } else {
    Serial.println("AUTO_TARE_ON_START = false. Tare skipped.");
  }

  connectWiFi();

  lastSendTime = millis();
  lastSerialTime = millis();
}

// ===============================
// 9. LOOP
// ===============================
void loop() {
  unsigned long now = millis();

  if (now - lastSerialTime >= SERIAL_INTERVAL_MS) {
    float currentWeight = readWeightGrams();
    notifyQuarterIfChanged(currentWeight);

    Serial.println();
    Serial.println("----- Current Load Cell Reading -----");
    Serial.print("Patient ID: ");
    Serial.println(PATIENT_ID);
    Serial.print("Weight/Volume: ");
    Serial.print(currentWeight, 2);
    Serial.println(" g / ml");
    Serial.print("Quarter Balance: ");
    Serial.print(getQuarterLevel(currentWeight));
    Serial.println("/4");
    Serial.println("Drop sensor: Not used");
    Serial.println("-------------------------------------");

    lastSerialTime = now;
  }

  if (now - lastSendTime >= SEND_INTERVAL_MS) {
    float currentWeight = readWeightGrams();

    Serial.println();
    Serial.print("===== ");
    Serial.print(SEND_INTERVAL_MS / 1000);
    Serial.println(" Second Load Cell Summary =====");
    Serial.print("Weight/Volume sent: ");
    Serial.print(currentWeight, 2);
    Serial.println(" g / ml");
    Serial.println("Flow status will be calculated in dashboard from weight trend.");
    Serial.println("========================================");

    sendDataToServer(currentWeight);

    lastSendTime = now;
  }
}
