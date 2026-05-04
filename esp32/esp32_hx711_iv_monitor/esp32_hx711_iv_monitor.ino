#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include "HX711.h"

// ===============================
// 1. WIFI SETTING
// ===============================
const char* WIFI_SSID = "@Faizall Ghazali";
const char* WIFI_PASSWORD = "nisa100316";

const char* SERVER_URL = "https://iv-bag-monitoring.onrender.com/api/update";
const char* API_KEY = "IVMONITOR123";

// Untuk Patient 1 guna 1, Patient 2 guna 2
const int PATIENT_ID = 1;

// ===============================
// 2. HX711 LOAD CELL PIN
// ===============================
#define HX711_DOUT_PIN 4
#define HX711_SCK_PIN 5

HX711 scale;

// Calibration factor ikut calibration awak yang sebelum ini berfungsi.
float CALIBRATION_FACTOR = -7050.0;

// Kalau bacaan jadi negatif, cuba tukar false kepada true.
bool REVERSE_WEIGHT_SIGN = false;

// true = tare masa mula. Pastikan load cell kosong ketika boot/reset.
// Kalau IV bag sudah tergantung sebelum ESP32 ON, tukar kepada false.
bool AUTO_TARE_ON_START = true;

// ===============================
// 3. DROP DETECTOR PIN
// ===============================
#define DROP_ADC_PIN 34

int idleDropADC = 0;
bool dropActive = false;

unsigned long totalDrops = 0;
unsigned long windowDrops = 0;

unsigned long lastDropTime = 0;
unsigned long lastSendTime = 0;
unsigned long lastSerialTime = 0;

const unsigned long DROP_DEBOUNCE_MS = 120;
const unsigned long SEND_INTERVAL_MS = 5000;    // stabil untuk Render, website refresh setiap 2 saat
const unsigned long SERIAL_INTERVAL_MS = 2000;  // print serial setiap 2 saat
const int DROP_ADC_THRESHOLD = 600;

const float SLOW_DROPS_PER_MIN = 10.0;
const float FAST_DROPS_PER_MIN = 80.0;

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
// 5. DROP SENSOR
// ===============================
int readAverageADC(int pin, int samples) {
  long total = 0;
  for (int i = 0; i < samples; i++) {
    total += analogRead(pin);
    delay(5);
  }
  return total / samples;
}

void calibrateDropIdle() {
  Serial.println("Calibrating drop detector idle value...");
  Serial.println("Pastikan tiada titisan / objek lalu antara LED dan LDR.");
  delay(1000);
  idleDropADC = readAverageADC(DROP_ADC_PIN, 100);
  Serial.print("Drop detector idle ADC value: ");
  Serial.println(idleDropADC);
}

void updateDropDetection() {
  int adcValue = analogRead(DROP_ADC_PIN);
  int difference = abs(adcValue - idleDropADC);
  bool currentActive = difference > DROP_ADC_THRESHOLD;
  unsigned long now = millis();

  if (currentActive && !dropActive) {
    if (now - lastDropTime > DROP_DEBOUNCE_MS) {
      totalDrops++;
      windowDrops++;
      lastDropTime = now;

      Serial.print("Drop detected! Total drops: ");
      Serial.print(totalDrops);
      Serial.print(" | ADC: ");
      Serial.println(adcValue);
    }
  }

  dropActive = currentActive;
}

// ===============================
// 6. LOAD CELL
// ===============================
float readWeightGrams() {
  // Jangan guna last valid weight. Website mesti ikut Serial Monitor 100%.
  if (!scale.is_ready()) {
    Serial.println("HX711 not ready. Reading sent as 0.00 g.");
    return 0.0;
  }

  float weight = scale.get_units(5);

  if (REVERSE_WEIGHT_SIGN) {
    weight = -weight;
  }

  if (abs(weight) < 2.0) {
    weight = 0.0;
  }

  if (weight < 0.0) {
    weight = 0.0;
  }

  return weight;
}

// ===============================
// 7. STATUS
// ===============================
String getDripStatus(float dropsPerMinute) {
  if (dropsPerMinute <= 0.0) return "No Drip";
  if (dropsPerMinute < SLOW_DROPS_PER_MIN) return "Slow";
  if (dropsPerMinute > FAST_DROPS_PER_MIN) return "Fast";
  return "Normal";
}

// ===============================
// 8. SEND DATA
// ===============================
void sendDataToServer(float weightGrams, float dropsPerMinute, String dripStatus) {
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

  String jsonPayload = "{";
  jsonPayload += "\"api_key\":\"" + String(API_KEY) + "\",";
  jsonPayload += "\"patient_id\":" + String(PATIENT_ID) + ",";
  jsonPayload += "\"weight_g\":" + String(weightGrams, 2) + ",";
  jsonPayload += "\"drop_count\":" + String(totalDrops) + ",";
  jsonPayload += "\"drops_per_min\":" + String(dropsPerMinute, 2) + ",";
  jsonPayload += "\"drip_status\":\"" + dripStatus + "\"";
  jsonPayload += "}";

  Serial.println();
  Serial.println("Sending data to server:");
  Serial.println(jsonPayload);
  Serial.print("Weight sent to website: ");
  Serial.print(weightGrams, 2);
  Serial.println(" g");

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
// 9. SETUP
// ===============================
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("==================================");
  Serial.println("IV Bag Monitoring ESP32 Started");
  Serial.println("Load Cell + Drop Detector");
  Serial.println("==================================");

  analogReadResolution(12);
  analogSetPinAttenuation(DROP_ADC_PIN, ADC_11db);

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

  calibrateDropIdle();
  connectWiFi();

  lastSendTime = millis();
  lastSerialTime = millis();
}

// ===============================
// 10. LOOP
// ===============================
void loop() {
  updateDropDetection();
  unsigned long now = millis();

  if (now - lastSerialTime >= SERIAL_INTERVAL_MS) {
    float currentWeight = readWeightGrams();
    int adcNow = analogRead(DROP_ADC_PIN);
    int diffNow = abs(adcNow - idleDropADC);

    Serial.println();
    Serial.println("----- Current Reading -----");
    Serial.print("Patient ID: ");
    Serial.println(PATIENT_ID);
    Serial.print("Weight: ");
    Serial.print(currentWeight, 2);
    Serial.println(" g");
    Serial.print("Drop ADC: ");
    Serial.print(adcNow);
    Serial.print(" | Idle ADC: ");
    Serial.print(idleDropADC);
    Serial.print(" | Difference: ");
    Serial.println(diffNow);
    Serial.print("Total Drops: ");
    Serial.println(totalDrops);
    Serial.println("---------------------------");

    lastSerialTime = now;
  }

  if (now - lastSendTime >= SEND_INTERVAL_MS) {
    float currentWeight = readWeightGrams();
    float dropsPerMinute = windowDrops * (60000.0 / SEND_INTERVAL_MS);
    String dripStatus = getDripStatus(dropsPerMinute);

    Serial.println();
    Serial.print("===== ");
    Serial.print(SEND_INTERVAL_MS / 1000);
    Serial.println(" Second Summary =====");
    Serial.print("Drops in window: ");
    Serial.println(windowDrops);
    Serial.print("Estimated drops/min: ");
    Serial.println(dropsPerMinute);
    Serial.print("Drip Status: ");
    Serial.println(dripStatus);
    Serial.println("=============================");

    sendDataToServer(currentWeight, dropsPerMinute, dripStatus);

    windowDrops = 0;
    lastSendTime = now;
  }
}
