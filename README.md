# IV Monitoring System - Load Cell Only + AI Voice Alert Update

This version keeps the existing design, Flask backend, PostgreSQL/Render support, ESP32 API endpoint, Excel export, bilingual BM/BI toggle, patient pages, alerts, and Chart.js graphs.

## Main update in this version

The system is now updated to use **load cell monitoring only**. The previous drip/drop detector function has been removed from the ESP32 sketches and the dashboard interface.

### What changed

- ESP32 now sends only load-cell weight data from HX711.
- Dashboard calculates IV level from weight using `500 ml = 500 g`.
- Dashboard estimates flow condition from the **weight trend over time**.
- User-facing drip rate/drop rate sections have been replaced with:
  - Load Cell Flow
  - Weight Flow Rate
  - Flow Status
  - Load Cell Flow Comparison
- Manual reading form now requires weight input only.
- Excel report now exports load-cell flow rate and load-cell flow status.
- Browser notifications, dashboard toast notifications, clinical sound alerts and bilingual AI voice alerts are added.

## Load-cell flow warning logic

The system does not use a physical flow sensor. Therefore, upstream/downstream problems are detected as an **early warning estimation** based on the load-cell weight trend.

The dashboard can classify these conditions:

- Normal Flow
- No Flow
- Slow Flow
- Fast Flow
- Sudden Drop
- Unstable Weight
- Bag Empty
- Stabilizing

Examples:

- If the weight does not decrease for a period of time, the system warns `No Flow`.
- If the weight decreases too slowly, the system warns `Slow Flow`.
- If the weight decreases too quickly, the system warns `Fast Flow`.
- If the weight suddenly drops, the system warns `Sudden Drop`.
- If the weight increases unexpectedly, the system warns `Unstable Weight`.

## AI voice alert

The dashboard uses browser speech synthesis.

- If the dashboard is in Bahasa Melayu, the voice alert uses Malay wording.
- If the dashboard is in English, the voice alert uses English wording.

Example Malay voice alert:

```text
Perhatian. Pesakit A ada masalah pada aliran IV. Sila periksa pesakit.
```

Example English voice alert:

```text
Attention. Patient A has a possible IV flow problem. Please check the patient.
```

Important: Browser security requires one click/tap on the dashboard page before sound or voice can play.

## Browser notification

Browser pop-up notifications are supported through the browser Notification API.

Requirements:

- Use HTTPS, such as the Render URL, or localhost for testing.
- When the browser asks for notification permission, click **Allow**.
- If notifications still do not appear, check Chrome/Edge site settings and allow notifications for the website.

## Alarm sound update

The continuous ECG-style flatline sound is not used. This version uses:

- Soft clinical chime for quarter-level notifications.
- Pulsed clinical call-bell style alarm for empty/critical IV level.
- AI voice alert for abnormal flow or critical warnings.

## ESP32 files

Use these files according to patient monitor:

```text
esp32/esp32_hx711_iv_monitor/esp32_hx711_iv_monitor.ino      -> Patient 1
esp32/esp32_hx711_iv_monitor/esp32_hx711_iv_monitor_2/esp32_hx711_iv_monitor_2.ino  -> Patient 2
```

Current calibration factors:

- Patient 1 sketch: `-521.70`
- Patient 2 sketch: `-526.64`

If the load-cell reading becomes negative, change:

```cpp
bool REVERSE_WEIGHT_SIGN = false;
```

to:

```cpp
bool REVERSE_WEIGHT_SIGN = true;
```

## Run locally

```bash
pip install -r requirements.txt
python app.py
```

Then open:

```text
http://127.0.0.1:5000
```

## Important files changed

```text
app.py
templates/base.html
templates/dashboard.html
static/js/app.js
static/css/styles.css
esp32/esp32_hx711_iv_monitor/esp32_hx711_iv_monitor.ino
esp32/esp32_hx711_iv_monitor/esp32_hx711_iv_monitor_2/esp32_hx711_iv_monitor_2.ino
```
