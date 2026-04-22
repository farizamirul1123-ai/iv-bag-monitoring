# IV Bag Monitoring System (Flask + PostgreSQL + ESP32)

This project is a ready-to-use starter kit for **IV bag level monitoring** using:
- **Load Cell + HX711**
- **ESP32**
- **Flask backend**
- **PostgreSQL database**
- **Responsive website dashboard**
- **Excel export**
- **BM / EN language toggle**

## Features included

### Landing page
- IV bag illustration
- Monitor selection:
  - Fariz
  - Ku Lee Chin
  - Hareny
- Stores who is monitoring the dashboard

### Dashboard
- 5 patient slots
- Only one patient detail shown at a time
- Click Patient ID 1, 2, 3, 4, or 5 to view its details
- Editable patient name and bed number
- Current IV weight
- IV level (%)
- Status: Normal / Low / Critical
- Last update time
- Professional graph trend (weight and level)
- Auto refresh selected patient data every 10 seconds
- Browser alert sound for Low / Critical updates
- Alert section when IV is low / critical
- Real-time clock (Local + UTC / world time)
- Excel export
- Mobile and laptop friendly UI
- BM / EN toggle button

### Backend API
- ESP32 can push data to `/api/update`
- Data is stored in PostgreSQL (or SQLite for local test)

---

## 1. Folder Structure

```bash
iv_monitoring_project/
│
├── app.py
├── requirements.txt
├── render.yaml
├── .env.example
├── README.md
├── templates/
│   ├── base.html
│   ├── login.html
│   └── dashboard.html
├── static/
│   ├── css/styles.css
│   └── js/app.js
└── esp32/
    └── esp32_hx711_iv_monitor.ino
```

---

## 2. How to run locally

### Step A - Install Python packages
```bash
pip install -r requirements.txt
```

### Step B - Run Flask app
```bash
python app.py
```

Open in browser:
```bash
http://127.0.0.1:5000
```

---

## 3. How to use the website

### Landing page
1. Open website
2. Choose monitor name
3. Click **Enter Monitoring Dashboard**

### Dashboard
- Left side shows **5 patient slots**
- Click one patient to see only that patient's details
- You can edit:
  - Patient name
  - Bed number
  - Full bag weight
  - Empty bag weight
- You can also test using **manual reading** before connecting ESP32

---

## 4. Status Logic

The system calculates IV level using this formula:

```text
IV Level (%) = ((Current Weight - Empty Bag Weight) / (Full Bag Weight - Empty Bag Weight)) × 100
```

### Status rules
- **Normal**: > 30%
- **Low**: 10% – 30%
- **Critical**: < 10%

---

## 5. API for ESP32

### Endpoint
```http
POST /api/update
```

### JSON body example
```json
{
  "api_key": "IVMONITOR123",
  "patient_id": 1,
  "weight_g": 425.50
}
```

### Success response example
```json
{
  "success": true,
  "patient_id": 1,
  "weight_g": 425.5,
  "level_percent": 75.1,
  "status": "Normal",
  "last_update_time": "2026-04-22T12:30:00+00:00"
}
```

---

## 6. Deploy to Render

### Option 1 - easiest
1. Upload this project to GitHub
2. Go to Render
3. Create **New Blueprint**
4. Select your GitHub repo
5. Render will detect `render.yaml`
6. It will create:
   - 1 Web Service
   - 1 PostgreSQL database

### Option 2 - manual setup
Create on Render:
- Web Service
- PostgreSQL database

Use:
- Build command: `pip install -r requirements.txt`
- Start command: `gunicorn app:app`

Environment variables:
- `SECRET_KEY`
- `API_KEY`
- `DATABASE_URL`

---

## 7. PostgreSQL Notes

The app already supports PostgreSQL using:
```python
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///iv_monitor.db")
```

So:
- local test -> SQLite
- Render deployment -> PostgreSQL

---

## 8. Excel Export

Click **Export Excel** on dashboard.
It exports:
- Current Status
- Historical Readings
- Alerts

---

## 9. Connecting ESP32

Open file:
```bash
esp32/esp32_hx711_iv_monitor.ino
```

Change these values:
- `YOUR_WIFI_NAME`
- `YOUR_WIFI_PASSWORD`
- `SERVER_URL`
- `CALIBRATION_FACTOR`
- `PATIENT_ID`

If you want one ESP32 per bed, use different `PATIENT_ID` from 1 to 5.

---

## 10. Important notes before real use

This project is suitable for:
- final year project
- prototype
- demo system
- proof of concept

For real hospital deployment, you should add:
- authentication with password
- stronger API security
- encrypted HTTPS endpoint
- device registration
- audit trail
- alarm notification (email / Telegram / SMS / buzzer)
- more accurate calibration and validation

---

## 11. Suggested workflow for you

1. Run website locally
2. Test manual readings
3. Check graph and alerts
4. Deploy to Render
5. Test API using Postman
6. Connect ESP32 + load cell
7. Calibrate actual IV bag weights
8. Finalize for presentation / FYP demo

---

## 12. Want to extend later?
You can easily add:
- nurse login system
- ward filter
- Telegram/WhatsApp alert
- auto refresh without reload
- multiple device IDs
- daily report PDF
- patient history page

