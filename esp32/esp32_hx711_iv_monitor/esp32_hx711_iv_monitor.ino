#include <WiFi.h>
#include <HTTPClient.h>
#include "HX711.h"

// ===================== WIFI =====================
const char* WIFI_SSID = "@Faizall Ghazali";
const char* WIFI_PASSWORD = "nisa100316";

// Laptop IP dari ipconfig awak
const char* SERVER_URL = "http://192.168.100.18:5000/api/update";

// Sama dengan app.py project awak
const char* API_KEY = "IVMONITOR123";

// ===================== HX711 =====================
// Sambungan:
// HX711 DT  -> ESP32 D4 (GPIO4)
// HX711 SCK -> ESP32 D5 (GPIO5)
// HX711 VCC -> 3.3V
// HX711 GND -> GND
#define DOUT 4
#define CLK 5

HX711 scale;

// Calibration dari coding lama awak
float zero_factor = 403497;
float calibration_factor = 359855.33;

// ===================== PATIENT SLOT =====================
// Tukar ikut katil/patient slot pada website: 1 hingga 5
int PATIENT_ID = 1;

// ===================== TIMING =====================
unsigned long lastPostTime = 0;
const unsigned long postInterval = 1000;   // 1 saat, lebih laju
const int sampleCount = 5;                 // average 5 bacaan

// ===================== OPTIONAL FILTER =====================
float lastValidWeightG = 0;

// ==========================================================
void connectWiFi() {
  Serial.print("Connecting to WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long startAttempt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startAttempt < 20000) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.println("Connected!");
    Serial.print("ESP32 IP Address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println();
    Serial.println("WiFi connection failed!");
  }
}

// Ambil average raw reading
long readAverageRaw(int times) {
  long sum = 0;
  for (int i = 0; i < times; i++) {
    sum += scale.read();
    delay(10);
  }
  return sum / times;
}

// Guna calibration lama awak
float getWeightKg() {
  long raw = readAverageRaw(sampleCount);
  float weight_kg = (raw - zero_factor) / calibration_factor;

  // buang nilai pelik
  if (weight_kg < 0) weight_kg = 0;
  if (weight_kg > 5) weight_kg = 0;   // safety filter

  return weight_kg;
}

void sendToServer(float weight_g) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi disconnected. Reconnecting...");
    connectWiFi();
  }

  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(SERVER_URL);
    http.addHeader("Content-Type", "application/json");

    String payload = "{";
    payload += "\"api_key\":\"" + String(API_KEY) + "\",";
    payload += "\"patient_id\":" + String(PATIENT_ID) + ",";
    payload += "\"weight_g\":" + String(weight_g, 2);
    payload += "}";

    Serial.println("Sending POST...");
    Serial.print("Payload: ");
    Serial.println(payload);

    int httpResponseCode = http.POST(payload);

    Serial.print("HTTP Response code: ");
    Serial.println(httpResponseCode);

    if (httpResponseCode > 0) {
      String response = http.getString();
      Serial.println("Server response:");
      Serial.println(response);
    } else {
      Serial.println("Error sending POST request");
      Serial.println("Semak:");
      Serial.println("1. python app.py sedang jalan");
      Serial.println("2. laptop & ESP32 pada WiFi sama");
      Serial.println("3. firewall Windows tak block port 5000");
      Serial.println("4. SERVER_URL betul");
    }

    http.end();
  } else {
    Serial.println("Still not connected to WiFi.");
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("====================================");
  Serial.println(" IV BAG MONITORING SYSTEM - ESP32");
  Serial.println("====================================");

  // HX711 start
  scale.begin(DOUT, CLK);

  // WiFi
  connectWiFi();

  Serial.println("System Ready.");
  Serial.println();
}

void loop() {
  if (millis() - lastPostTime >= postInterval) {
    lastPostTime = millis();

    float weight_kg = getWeightKg();
    float weight_g = weight_kg * 1000.0;

    // optional smoothing ringkas
    if (weight_g == 0 && lastValidWeightG > 0) {
      weight_g = 0; // kekal 0 kalau memang kosong
    } else {
      lastValidWeightG = weight_g;
    }

    Serial.print("Weight (kg): ");
    Serial.println(weight_kg, 3);

    Serial.print("Weight (g): ");
    Serial.println(weight_g, 2);

    sendToServer(weight_g);

    Serial.println("------------------------------------");
  }
}
