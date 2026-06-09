#include "HX711.h"

// HX711 pin ikut project awak
#define HX711_DOUT_PIN 4
#define HX711_SCK_PIN 5

HX711 scale;

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("=================================");
  Serial.println("HX711 RAW READING TEST");
  Serial.println("Load Cell 5kg + HX711");
  Serial.println("=================================");

  scale.begin(HX711_DOUT_PIN, HX711_SCK_PIN);
  delay(1000);

  if (scale.is_ready()) {
    Serial.println("HX711 detected.");
  } else {
    Serial.println("HX711 not ready. Check wiring.");
  }
}

void loop() {
  if (scale.is_ready()) {
    long rawReading = scale.read();

    Serial.print("Raw Reading: ");
    Serial.println(rawReading);
  } else {
    Serial.println("HX711 not ready.");
  }

  delay(500);
}
