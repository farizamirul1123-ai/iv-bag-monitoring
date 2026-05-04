#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include "HX711.h"

// ===============================
// 1. WIFI SETTING
// ===============================
const char* WIFI_SSID = "@Faizall Ghazali";
const char* WIFI_PASSWORD = "nisa100316";

// Kalau guna Render, contoh:
// const char* SERVER_URL = "https://iv-bag-monitoring.onrender.com/api/update";
const char* SERVER_URL = "https://iv-bag-monitoring.onrender.com/api/update";

const char* API_KEY = "IVMONITOR123";

// Untuk Patient 1 guna 1
// Untuk Patient 2 guna 2
const int PATIENT_ID = 2;


// ===============================
// 2. HX711 LOAD CELL PIN
// ===============================
#define HX711_DOUT_PIN 4
#define HX711_SCK_PIN 5

HX711 scale;

// Calibration factor WAJIB adjust ikut load cell awak.
// Kalau berat jadi negatif, cuba tukar tanda negatif/positif.
float CALIBRATION_FACTOR = -7050.0;

// Kalau bacaan berat terbalik, tukar false kepada true.
bool REVERSE_WEIGHT_SIGN = false;

// Jika bacaan jadi negatif kerana polarity/calibration sign, jadikan positif.
bool USE_ABSOLUTE_WEIGHT = true;

// Jika ESP32 boot/reset masa IV bag sudah tergantung, tukar kepada false.
bool AUTO_TARE_ON_START = true;


// ===============================
// 3. DROP DETECTOR PIN
// ===============================
// GPIO34 = analog input sahaja. Sesuai untuk baca COMP_OUT melalui voltage divider.
#define DROP_ADC_PIN 34

// Drop detector setting
int idleDropADC = 0;
bool dropActive = false;

unsigned long totalDrops = 0;
unsigned long windowDrops = 0;

unsigned long lastDropTime = 0;
unsigned long lastSendTime = 0;
unsigned long lastSerialTime = 0;

float lastValidWeightGrams = 0.0;
bool hasValidWeight = false;

const unsigned long DROP_DEBOUNCE_MS = 120;
const unsigned long SEND_INTERVAL_MS = 2000;   // hantar ke server setiap 10 saat
const unsigned long SERIAL_INTERVAL_MS = 2000;  // print serial setiap 2 saat

// Jika sensor susah detect, cuba kecilkan 600 kepada 400.
// Jika terlalu sensitif, naikkan 600 kepada 800.
const int DROP_ADC_THRESHOLD = 600;


// ===============================
// 4. DRIP RATE STATUS SETTING
// ===============================
// Ini untuk bacaan Serial Monitor dulu.
// Dashboard nanti kita ubah supaya boleh simpan drip status.
const float SLOW_DROPS_PER_MIN = 10.0;
const float FAST_DROPS_PER_MIN = 80.0;


// ===============================
// 5. FUNCTION: CONNECT WIFI
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
// 6. FUNCTION: READ AVERAGE ADC
// ===============================
int readAverageADC(int pin, int samples) {
  long total = 0;

  for (int i = 0; i < samples; i++) {
    total += analogRead(pin);
    delay(5);
  }

  return total / samples;
}


// ===============================
// 7. FUNCTION: CALIBRATE DROP IDLE
// ===============================
void calibrateDropIdle() {
  Serial.println("Calibrating drop detector idle value...");
  Serial.println("Pastikan tiada titisan / objek lalu antara LED dan LDR.");

  delay(1000);

  idleDropADC = readAverageADC(DROP_ADC_PIN, 100);

  Serial.print("Drop detector idle ADC value: ");
  Serial.println(idleDropADC);
}


// ===============================
// 8. FUNCTION: READ WEIGHT
// ===============================
float readWeightGrams() {
  if (!scale.is_ready()) {
    Serial.println("HX711 not ready. Check wiring. Last valid weight will be used.");
    if (hasValidWeight) {
      return lastValidWeightGrams;
    }
    return 0.0;
  }

  float weight = scale.get_units(10);

  if (REVERSE_WEIGHT_SIGN) {
    weight = -weight;
  }

  // Jika bacaan jadi negatif kerana polarity/calibration sign, jangan hantar -1 ke dashboard.
  if (USE_ABSOLUTE_WEIGHT && weight < 0) {
    weight = abs(weight);
  }

  // Buang noise kecil sahaja.
  if (abs(weight) < 2.0) {
    weight = 0.0;
  }

  if (weight >= 0.0) {
    lastValidWeightGrams = weight;
    hasValidWeight = true;
  }

  return weight;
}


// ===============================
// 9. FUNCTION: DROP DETECTION
// ===============================
void updateDropDetection() {
  int adcValue = analogRead(DROP_ADC_PIN);

  int difference = abs(adcValue - idleDropADC);

  bool currentActive = difference > DROP_ADC_THRESHOLD;
  unsigned long now = millis();

  // Kira drop hanya bila signal baru mula aktif
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
// 10. FUNCTION: DRIP STATUS
// ===============================
String getDripStatus(float dropsPerMinute) {
  if (dropsPerMinute <= 0.0) {
    return "No Drip";
  } else if (dropsPerMinute < SLOW_DROPS_PER_MIN) {
    return "Slow";
  } else if (dropsPerMinute > FAST_DROPS_PER_MIN) {
    return "Fast";
  } else {
    return "Normal";
  }
}


// ===============================
// 11. FUNCTION: SEND DATA TO SERVER
// ===============================
void sendDataToServer(float weightGrams, float dropsPerMinute, String dripStatus) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected. Data not sent.");
    connectWiFi();
    return;
  }

  HTTPClient http;
  WiFiClientSecure secureClient;

  String url = String(SERVER_URL);

  if (url.startsWith("https://")) {
    secureClient.setInsecure();
    http.begin(secureClient, url);
  } else {
    http.begin(url);
  }

  http.addHeader("Content-Type", "application/json");

  // Current dashboard hanya simpan weight_g.
  // drop_count, drops_per_min dan drip_status dihantar sekali,
  // tapi backend sekarang akan ignore dulu. Nanti kita ubah dashboard/backend.
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

  int httpResponseCode = http.POST(jsonPayload);

  Serial.print("HTTP Response Code: ");
  Serial.println(httpResponseCode);

  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.println("Server response:");
    Serial.println(response);
  } else {
    Serial.println("Failed to send data.");
  }

  http.end();
}


// ===============================
// 12. SETUP
// ===============================
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("==================================");
  Serial.println("IV Bag Monitoring ESP32 Started");
  Serial.println("Load Cell + Drop Detector");
  Serial.println("==================================");

  // Analog setup
  analogReadResolution(12);
  analogSetPinAttenuation(DROP_ADC_PIN, ADC_11db);

  // HX711 setup
  scale.begin(HX711_DOUT_PIN, HX711_SCK_PIN);
  scale.set_scale(CALIBRATION_FACTOR);

  if (AUTO_TARE_ON_START) {
    Serial.println("Taring load cell...");
    Serial.println("Pastikan tiada beban pada load cell.");
    delay(2000);
    scale.tare();
    Serial.println("Tare completed.");
  } else {
    Serial.println("AUTO_TARE_ON_START = false. Tare skipped.");
    Serial.println("Use this mode only if the IV bag is already mounted during ESP32 boot/reset.");
  }

  // Drop detector idle calibration
  calibrateDropIdle();

  // WiFi
  connectWiFi();

  lastSendTime = millis();
  lastSerialTime = millis();
}


// ===============================
// 13. LOOP
// ===============================
void loop() {
  updateDropDetection();

  unsigned long now = millis();

  // Print bacaan setiap 2 saat
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

  // Hantar data setiap 10 saat
  if (now - lastSendTime >= SEND_INTERVAL_MS) {
    float currentWeight = readWeightGrams();

    // Sebab interval 10 saat, darab 6 untuk anggaran drops/min
    float dropsPerMinute = windowDrops * 30.0;
    String dripStatus = getDripStatus(dropsPerMinute);

    Serial.println();
    Serial.println("===== 10 Second Summary =====");
    Serial.print("Drops in 10 seconds: ");
    Serial.println(windowDrops);
    Serial.print("Estimated drops/min: ");
    Serial.println(dropsPerMinute);
    Serial.print("Drip Status: ");
    Serial.println(dripStatus);
    Serial.println("=============================");

    sendDataToServer(currentWeight, dropsPerMinute, dripStatus);

    // Reset kiraan window untuk 10 saat seterusnya
    windowDrops = 0;
    lastSendTime = now;
  }
}
