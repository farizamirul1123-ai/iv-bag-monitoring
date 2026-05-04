# IV Monitoring System - Premium Template V10

This version keeps the original Flask backend, PostgreSQL/Render support, ESP32 API endpoint, Excel export, bilingual BM/BI toggle, patient pages, alerts, and Chart.js graphs.

## What was changed in V10

- Landing page redesigned into a professional website-template style.
- Right landing area replaced with a clean dashboard preview instead of the previous awkward IV graphic layout.
- Monitor selection page alignment fixed. The 1-2-3 stepper is centered and responsive.
- Dashboard style refined with better card spacing, safer responsive layout, glass effect, cleaner chart containers, hover effects, and entrance animations.
- Mobile responsiveness improved for phone and laptop views.
- Added CSS animation effects: fade/slide entry, hover lift, shimmer accent, floating preview, animated chart-line effect, live pulse.

## Run locally

```bash
pip install -r requirements.txt
python app.py
```

Then open:

```text
http://127.0.0.1:5000
```

For ESP32 on the same WiFi network, use the computer IP address shown in the terminal or by `ipconfig`.

## Important file changed for design

```text
templates/landing.html
templates/select_monitor.html
static/css/styles.css
```

The backend files are unchanged from the working version.


## Minimal fixes added

- Last Update now uses Malaysia time (UTC+8) so Render time matches the ESP32 Serial Monitor.
- ESP32 sketches avoid sending `-1` to the dashboard when HX711 is momentarily not ready; they reuse the last valid weight or send 0 only when no valid value exists yet.
- Backend ignores invalid tiny ESP32 readings (`<= 5 g`) and keeps the last valid weight, so the dashboard does not get stuck at `1 ml` due to HX711 error/noise.
- Existing design, routes, database structure, API key, and Render endpoint are kept as-is.


## Realtime Match Fix
- Website now saves 0.00 g from ESP32 as 0.00 g. It no longer keeps old 19 g / 25 g values when Serial Monitor shows 0 g.
- ESP32 sends data every 2 seconds. Drops/min formula changed to `windowDrops * 30.0`.
- ESP32 sends the same `latestWeightGrams` shown in Serial Monitor so dashboard and Serial Monitor match.
- HTTP timeout added to reduce long blocking when Render is slow.
