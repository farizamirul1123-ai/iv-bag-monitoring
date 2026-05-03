# IV Monitoring System Dashboard

Professional Flask + PostgreSQL + ESP32 dashboard for monitoring IV bag level using a load cell and drop detector.

## Main updates in this version

- New premium landing page with Politeknik Seberang Perai and Kementerian Pendidikan logos.
- New monitor selection page for Fariz, Hareny, and Madam Ku Lee Chin.
- New responsive dashboard for 2 patients only.
- Live cards for IV level, remaining weight, drip rate, flow rate, status, and last update time.
- Moving Chart.js graphs:
  - IV Weight vs Time for Patient A
  - IV Weight vs Time for Patient B
  - Drop Rate Comparison / All Drop Trend
- ESP32 `/api/update` now accepts `drop_count`, `drops_per_min`, and `drip_status`.
- Excel export includes patient status, readings, drop rate, flow rate, and alerts.
- Mobile-friendly layout with bottom navigation.
- Auto-refresh every 5 seconds.
- PostgreSQL/Render ready.

## Folder structure

```bash
iv_monitoring_project/
├── app.py
├── requirements.txt
├── runtime.txt
├── render.yaml
├── .env.example
├── templates/
│   ├── base.html
│   ├── landing.html
│   ├── select_monitor.html
│   ├── dashboard.html
│   └── partials_iv_bag.html
├── static/
│   ├── css/styles.css
│   ├── js/app.js
│   └── img/
│       ├── psp-logo.png
│       └── kpm-logo.png
└── esp32/
    └── esp32_hx711_iv_monitor/
        └── esp32_hx711_iv_monitor.ino
```

## Run locally

```bash
pip install -r requirements.txt
python app.py
```

Open:

```text
http://127.0.0.1:5000
```

## ESP32 data format

The ESP32 can send JSON data to:

```text
POST /api/update
```

Example:

```json
{
  "api_key": "IVMONITOR123",
  "patient_id": 1,
  "weight_g": 340.0,
  "drop_count": 120,
  "drops_per_min": 24.0,
  "drip_status": "Normal"
}
```

For Patient 1, set:

```cpp
const int PATIENT_ID = 1;
```

For Patient 2, set:

```cpp
const int PATIENT_ID = 2;
```

## Dashboard status logic

- Normal: IV level above 30%
- Low: IV level from 10% to 30%
- Critical: IV level below 10%

Flow rate is calculated using:

```text
ml/hr = drops_per_min × 60 / DROP_FACTOR
```

Default `DROP_FACTOR` is `20 drops/ml`. You can change it in Render environment variables if your drip set uses a different drop factor.

## Render deployment

This project includes `render.yaml`. The database is connected using the `DATABASE_URL` environment variable. The app automatically upgrades old database tables by adding the new drop-rate columns if they are missing.

## Notes

If your graph does not move:

1. Check Serial Monitor to confirm ESP32 is sending new readings.
2. Confirm the Render URL in ESP32 ends with `/api/update`.
3. Confirm `API_KEY` in ESP32 matches Render environment variable.
4. Confirm `patient_id` is either `1` or `2`.
5. Open `/api/dashboard-data` in the browser and check whether new readings appear.
