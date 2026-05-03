/*
  ESP32 + HX711 IV Monitoring Sender
  Sends load-cell weight and drop-rate value to Flask/Render dashboard.

  Library needed in Arduino IDE:
  - HX711 by Bogdan Necula / Rob Tillaart compatible library

  Dashboard endpoint example:
  https://your-render-app.onrender.com/api/update
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include "HX711.h"

// ===== WiFi =====
const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// ===== Render Flask API =====
const char* SERVER_URL = "https://your-render-app.onrender.com/api/update";
const char* API_KEY = "IVMONITOR123";

// ===== Patient selection =====
// Patient A = 1, Patient B = 2
int PATIENT_ID = 1;

// ===== HX711 Pins =====
#define HX711_DOUT  19
#define HX711_SCK   18
HX711 scale;

// Calibration factor must be adjusted based on your own load cell.
// If serial value is negative, change this value from positive to negative or vice versa.
float CALIBRATION_FACTOR = -7050.0;

// ===== Drip rate placeholder =====
// If you do not use drip sensor, the dashboard can still show a fixed/test value.
// Change manually for Patient A / Patient B test.
float dropsPerMin = 24.0;

unsigned long lastPost = 0;
const unsigned long POST_INTERVAL_MS = 5000;

void connectWiFi() {
  Serial.print("Connecting to WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 40) {
    delay(500);
    Serial.print(".");
    tries++;
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("WiFi connected. IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("WiFi failed. Check SSID/password.");
  }
}

float readWeightGram() {
  if (!scale.is_ready()) {
    Serial.println("HX711 not ready");
    return 0;
  }
  float weight = scale.get_units(10); // average 10 samples
  if (weight < 0) weight = abs(weight); // protects dashboard from reversed polarity calibration
  return weight;
}

void sendToDashboard(float weightG, float dripRate) {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
    if (WiFi.status() != WL_CONNECTED) return;
  }

  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");

  String payload = "{";
  payload += "\"api_key\":\"" + String(API_KEY) + "\",";
  payload += "\"patient_id\":" + String(PATIENT_ID) + ",";
  payload += "\"weight_g\":" + String(weightG, 2) + ",";
  payload += "\"drops_per_min\":" + String(dripRate, 2);
  payload += "}";

  Serial.println("POST payload:");
  Serial.println(payload);

  int httpCode = http.POST(payload);
  Serial.print("HTTP Response code: ");
  Serial.println(httpCode);
  if (httpCode > 0) {
    Serial.println(http.getString());
  }
  http.end();
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  connectWiFi();

  scale.begin(HX711_DOUT, HX711_SCK);
  scale.set_scale(CALIBRATION_FACTOR);
  scale.tare();
  Serial.println("HX711 ready. Tare completed.");
}

void loop() {
  float weightG = readWeightGram();

  Serial.println("====================");
  Serial.print("Patient ID: "); Serial.println(PATIENT_ID);
  Serial.print("Total Weight (g): "); Serial.println(weightG, 2);
  Serial.print("Drops/min: "); Serial.println(dropsPerMin, 2);

  if (millis() - lastPost >= POST_INTERVAL_MS) {
    lastPost = millis();
    sendToDashboard(weightG, dropsPerMin);
  }

  delay(1000);
}
