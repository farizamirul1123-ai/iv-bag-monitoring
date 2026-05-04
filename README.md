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
