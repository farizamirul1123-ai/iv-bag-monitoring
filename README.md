# IV Monitoring System Dashboard

Full Flask + PostgreSQL/SQLite dashboard for ESP32 + HX711 IV bag monitoring.

## Features
- Welcome page, monitor selection page, and professional dashboard interface.
- Sidebar sections: Dashboard, Monitors, Patients, Alerts, Reports, Settings.
- BM/EN switch: the interface changes fully to Bahasa Melayu or English.
- Responsive layout for laptop and phone. On phone, the sidebar becomes a bottom navigation bar.
- Animated live indicators, smooth page transition, moving charts, and animated IV bag fill.
- Excel export endpoint.
- PostgreSQL ready for Render. SQLite runs automatically for local testing.
- ESP32 API endpoint: `/api/update`.

## Run locally
```bash
cd iv_monitoring_dashboard_final
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt
python app.py
```
Open: `http://127.0.0.1:5000`

## Render deployment
1. Upload this folder to GitHub.
2. On Render, create a new Web Service from the repository.
3. Add PostgreSQL database or use `render.yaml`.
4. Environment variables:
   - `DATABASE_URL` = Render PostgreSQL external/internal connection string
   - `API_KEY` = `IVMONITOR123` or your own key
   - `AUTO_DEMO=true` for demo moving graph without ESP32
   - Set `AUTO_DEMO=false` when you only want real ESP32 data.

## ESP32 POST format
Send JSON to:
```
https://your-render-url.onrender.com/api/update
```
Example body:
```json
{
  "api_key": "IVMONITOR123",
  "patient_id": 1,
  "weight_g": 540,
  "drops_per_min": 24
}
```
Accepted weight keys include: `weight_g`, `weight`, `total_weight`, `total_weight_g`.
Accepted drip keys include: `drops_per_min`, `drop_rate`, `drip_rate`.

## Important note
For real monitoring, ESP32 must run and send data to `/api/update`. If ESP32 is not running, `AUTO_DEMO=true` will still make the graph move so the dashboard can be tested and presented.
