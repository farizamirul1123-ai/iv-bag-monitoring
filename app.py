import os
from io import BytesIO
from datetime import datetime, timedelta

import pandas as pd
from flask import (
    Flask,
    render_template,
    request,
    redirect,
    url_for,
    session,
    jsonify,
    send_file,
    flash,
)
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import desc, inspect, text

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "iv-monitor-secret-key")

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///iv_monitor.db")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

app.config["SQLALCHEMY_DATABASE_URI"] = DATABASE_URL
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db = SQLAlchemy(app)

MONITOR_OPTIONS = ["Fariz Amirul", "Hareny", "Madam Ku Lee Chin"]
DEFAULT_API_KEY = os.getenv("API_KEY", "IVMONITOR123")
DROP_FACTOR = float(os.getenv("DROP_FACTOR", "20"))  # 20 drops/ml is a common macrodrip set.


def malaysia_now():
    """Return Malaysia local time as a naive datetime for DB storage/display.

    Render servers normally run on UTC, while the IV dashboard is used in
    Malaysia. Keeping this as a small helper avoids Last Update showing 8 hours
    behind the ESP32 Serial Monitor.
    """
    return datetime.utcnow() + timedelta(hours=8)


class MonitorLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    monitor_name = db.Column(db.String(100), nullable=False)
    login_time = db.Column(db.DateTime, default=malaysia_now, nullable=False)


class PatientSlot(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    patient_name = db.Column(db.String(120), nullable=False)
    bed_number = db.Column(db.String(50), nullable=False)
    ward_number = db.Column(db.String(50), nullable=True, default="Ward 3A")
    full_weight_g = db.Column(db.Float, nullable=False, default=550.0)
    empty_weight_g = db.Column(db.Float, nullable=False, default=50.0)
    current_weight_g = db.Column(db.Float, nullable=False, default=550.0)
    current_level_percent = db.Column(db.Float, nullable=False, default=100.0)
    current_drop_rate = db.Column(db.Float, nullable=True, default=0.0)
    current_flow_rate_ml_hr = db.Column(db.Float, nullable=True, default=0.0)
    current_drip_status = db.Column(db.String(30), nullable=True, default="Normal")
    current_status = db.Column(db.String(20), nullable=False, default="Normal")
    last_update_time = db.Column(db.DateTime, default=malaysia_now, nullable=False)


class Reading(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.Integer, db.ForeignKey("patient_slot.id"), nullable=False)
    weight_g = db.Column(db.Float, nullable=False)
    level_percent = db.Column(db.Float, nullable=False)
    status = db.Column(db.String(20), nullable=False)
    drop_count = db.Column(db.Integer, nullable=True, default=0)
    drops_per_min = db.Column(db.Float, nullable=True, default=0.0)
    flow_rate_ml_hr = db.Column(db.Float, nullable=True, default=0.0)
    drip_status = db.Column(db.String(30), nullable=True, default="Normal")
    source = db.Column(db.String(30), nullable=False, default="system")
    created_at = db.Column(db.DateTime, default=malaysia_now, nullable=False)


class Alert(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.Integer, db.ForeignKey("patient_slot.id"), nullable=False)
    level_percent = db.Column(db.Float, nullable=False)
    alert_type = db.Column(db.String(20), nullable=False)
    message = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=malaysia_now, nullable=False)
    acknowledged = db.Column(db.Boolean, default=False, nullable=False)


def utcnow():
    # Kept for compatibility with the existing code name.
    return malaysia_now()


def normalize_dt(value):
    if value is None:
        return None
    if getattr(value, "tzinfo", None) is not None:
        return value.replace(tzinfo=None)
    return value


def format_dt(value, fmt="%d/%m/%Y %H:%M:%S"):
    value = normalize_dt(value)
    if value is None:
        return "-"
    return value.strftime(fmt)


def format_time(value):
    return format_dt(value, "%I:%M:%S %p")


def calculate_level(current_weight, empty_weight, full_weight):
    """Return IV level percentage from the load-cell reading.

    For this project, the dashboard follows the ESP32 Serial Monitor value:
    current_weight_g is treated as the current total measured weight from the
    load cell. Therefore the percentage is calculated against full_weight_g.
    empty_weight_g is still displayed for reference/calibration, but it is not
    subtracted here. This avoids the dashboard showing 0% when the load cell is
    already sending a valid measured weight.
    """
    try:
        current = max(float(current_weight or 0), 0.0)
        full = max(float(full_weight or 0), 1.0)
    except (TypeError, ValueError):
        current, full = 0.0, 1.0
    percent = (current / full) * 100.0
    percent = max(0.0, min(100.0, percent))
    return round(percent, 2)


def get_status(level_percent):
    if level_percent < 10:
        return "Critical"
    if level_percent <= 30:
        return "Low"
    return "Normal"


def calculate_flow_rate(drops_per_min):
    try:
        return round((float(drops_per_min) * 60.0) / max(DROP_FACTOR, 1.0), 2)
    except (TypeError, ValueError):
        return 0.0


def ensure_schema_upgrades():
    """Small safe migration helper for old SQLite/PostgreSQL deployments.
    create_all() does not add new columns to an existing table, so this keeps
    old Render databases compatible with the new drop-rate dashboard.
    """
    inspector = inspect(db.engine)
    tables = set(inspector.get_table_names())

    def existing_columns(table_name):
        if table_name not in tables:
            return set()
        return {col["name"] for col in inspector.get_columns(table_name)}

    upgrades = {
        "patient_slot": {
            "ward_number": "VARCHAR(50) DEFAULT 'Ward 3A'",
            "current_drop_rate": "FLOAT DEFAULT 0",
            "current_flow_rate_ml_hr": "FLOAT DEFAULT 0",
            "current_drip_status": "VARCHAR(30) DEFAULT 'Normal'",
        },
        "reading": {
            "drop_count": "INTEGER DEFAULT 0",
            "drops_per_min": "FLOAT DEFAULT 0",
            "flow_rate_ml_hr": "FLOAT DEFAULT 0",
            "drip_status": "VARCHAR(30) DEFAULT 'Normal'",
        },
    }

    for table_name, cols in upgrades.items():
        if table_name not in tables:
            continue
        current = existing_columns(table_name)
        for col_name, ddl in cols.items():
            if col_name not in current:
                db.session.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {col_name} {ddl}"))
    db.session.commit()


def seed_database():
    defaults = [
        {"patient_name": "Patient A", "bed_number": "Bed 05", "ward_number": "Ward 3A"},
        {"patient_name": "Patient B", "bed_number": "Bed 06", "ward_number": "Ward 3A"},
    ]

    existing = PatientSlot.query.order_by(PatientSlot.id).all()
    if len(existing) < 2:
        for item in defaults[len(existing):]:
            patient = PatientSlot(
                patient_name=item["patient_name"],
                bed_number=item["bed_number"],
                ward_number=item["ward_number"],
                full_weight_g=550.0,
                empty_weight_g=50.0,
                current_weight_g=550.0,
                current_level_percent=100.0,
                current_drop_rate=0.0,
                current_flow_rate_ml_hr=0.0,
                current_drip_status="Normal",
                current_status="Normal",
                last_update_time=utcnow(),
            )
            db.session.add(patient)
        db.session.commit()

    patients = PatientSlot.query.order_by(PatientSlot.id).limit(2).all()
    for idx, patient in enumerate(patients):
        # Upgrade old default names from the previous 5-patient version without
        # overwriting user-custom names.
        if patient.patient_name in [f"Patient {idx + 1}", "Patient 1", "Patient 2"]:
            patient.patient_name = defaults[idx]["patient_name"]
        if not getattr(patient, "ward_number", None):
            patient.ward_number = defaults[idx]["ward_number"]
        if not patient.bed_number:
            patient.bed_number = defaults[idx]["bed_number"]
        if patient.current_drop_rate is None:
            patient.current_drop_rate = 0.0
        if patient.current_flow_rate_ml_hr is None:
            patient.current_flow_rate_ml_hr = 0.0
        if not patient.current_drip_status:
            patient.current_drip_status = "Normal"

        if Reading.query.filter_by(patient_id=patient.id).count() == 0:
            # Demo history gives the dashboard visible moving graphs on first launch.
            # Once ESP32 data arrives, these are simply older readings.
            base_now = utcnow() - timedelta(minutes=70)
            if idx == 0:
                weights = [520, 500, 485, 470, 455, 435, 420, 400, 385, 365, 350, 340]
                drops = [28, 26, 31, 27, 29, 26, 25, 28, 24, 23, 24, 24]
            else:
                weights = [500, 475, 455, 435, 360, 340, 320, 290, 260, 220, 170, 110]
                drops = [15, 13, 12, 11, 12, 10, 11, 9, 8, 7, 8, 12]

            for n, (weight, drop_rate) in enumerate(zip(weights, drops)):
                level = calculate_level(weight, patient.empty_weight_g, patient.full_weight_g)
                status = get_status(level)
                flow = calculate_flow_rate(drop_rate)
                drip_status = get_drip_status(drop_rate)
                db.session.add(
                    Reading(
                        patient_id=patient.id,
                        weight_g=weight,
                        level_percent=level,
                        status=status,
                        drops_per_min=drop_rate,
                        flow_rate_ml_hr=flow,
                        drip_status=drip_status,
                        drop_count=n * int(max(drop_rate, 1)),
                        source="demo",
                        created_at=base_now + timedelta(minutes=n * 6),
                    )
                )
            patient.current_weight_g = weights[-1]
            patient.current_level_percent = calculate_level(weights[-1], patient.empty_weight_g, patient.full_weight_g)
            patient.current_status = get_status(patient.current_level_percent)
            patient.current_drop_rate = drops[-1]
            patient.current_flow_rate_ml_hr = calculate_flow_rate(drops[-1])
            patient.current_drip_status = get_drip_status(drops[-1])
            patient.last_update_time = base_now + timedelta(minutes=(len(weights) - 1) * 6)
            create_alert_if_needed(patient)
    db.session.commit()


def create_alert_if_needed(patient):
    # IV level alert.
    if patient.current_status not in ["Low", "Critical"]:
        return

    cutoff_minutes = 5
    latest_similar = (
        Alert.query.filter_by(patient_id=patient.id, alert_type=patient.current_status)
        .order_by(desc(Alert.created_at))
        .first()
    )

    now = utcnow()
    if latest_similar:
        latest_created = normalize_dt(latest_similar.created_at)
        now_naive = normalize_dt(now)
        if latest_created and (now_naive - latest_created).total_seconds() < cutoff_minutes * 60:
            return

    msg = (
        f"{patient.patient_name} IV level is {patient.current_status.lower()} "
        f"at {patient.current_level_percent:.1f}%. Please monitor."
    )

    db.session.add(
        Alert(
            patient_id=patient.id,
            level_percent=patient.current_level_percent,
            alert_type=patient.current_status,
            message=msg,
            created_at=now,
        )
    )


@app.before_request
def ensure_db_ready():
    db.create_all()
    ensure_schema_upgrades()
    seed_database()


@app.context_processor
def inject_globals():
    return {
        "monitor_options": MONITOR_OPTIONS,
        "active_language": session.get("language", "en"),
    }


@app.route("/")
def index():
    language = request.args.get("lang")
    if language in ["en", "ms"]:
        session["language"] = language
    return render_template("landing.html")


@app.route("/select-monitor")
def select_monitor():
    return render_template("select_monitor.html")


@app.route("/set-language/<lang>", methods=["POST"])
def set_language(lang):
    if lang in ["en", "ms"]:
        session["language"] = lang
    next_url = request.form.get("next_url") or request.referrer or url_for("index")
    return redirect(next_url)


@app.route("/login", methods=["POST"])
def login():
    monitor_name = request.form.get("monitor_name", "").strip()
    if monitor_name not in MONITOR_OPTIONS:
        flash("Please select a valid monitor.")
        return redirect(url_for("select_monitor"))

    session["monitor_name"] = monitor_name
    db.session.add(MonitorLog(monitor_name=monitor_name, login_time=utcnow()))
    db.session.commit()
    return redirect(url_for("dashboard"))


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("index"))


@app.route("/dashboard")
def dashboard():
    if "monitor_name" not in session:
        return redirect(url_for("index"))

    patients = PatientSlot.query.order_by(PatientSlot.id).limit(2).all()
    alerts = Alert.query.order_by(desc(Alert.created_at)).limit(50).all()

    return render_template(
        "dashboard.html",
        patients=patients,
        alerts=alerts,
        now_utc=utcnow(),
        monitor_name=session.get("monitor_name", "Monitor"),
        dashboard_data=build_dashboard_payload(),
    )


@app.route("/update-patient/<int:patient_id>", methods=["POST"])
def update_patient(patient_id):
    patient = PatientSlot.query.get_or_404(patient_id)
    patient.patient_name = request.form.get("patient_name", patient.patient_name).strip() or patient.patient_name
    patient.bed_number = request.form.get("bed_number", patient.bed_number).strip() or patient.bed_number
    patient.ward_number = request.form.get("ward_number", patient.ward_number or "Ward 3A").strip() or patient.ward_number
    patient.full_weight_g = float(request.form.get("full_weight_g", patient.full_weight_g))
    patient.empty_weight_g = float(request.form.get("empty_weight_g", patient.empty_weight_g))

    patient.current_level_percent = calculate_level(
        patient.current_weight_g, patient.empty_weight_g, patient.full_weight_g
    )
    patient.current_status = get_status(patient.current_level_percent)

    db.session.commit()
    create_alert_if_needed(patient)
    db.session.commit()

    return redirect(url_for("dashboard"))


@app.route("/manual-reading/<int:patient_id>", methods=["POST"])
def manual_reading(patient_id):
    patient = PatientSlot.query.get_or_404(patient_id)

    try:
        weight_g = float(request.form.get("weight_g"))
        drops_per_min = float(request.form.get("drops_per_min") or 0)
    except (TypeError, ValueError):
        flash("Invalid reading value.")
        return redirect(url_for("dashboard"))

    save_reading(patient, weight_g, drops_per_min=drops_per_min, source="manual")
    return redirect(url_for("dashboard"))


def first_payload_value(payload, *keys, default=None):
    """Return the first non-empty payload value for compatibility with ESP32 code."""
    for key in keys:
        try:
            value = payload.get(key)
        except AttributeError:
            value = None
        if value is not None and value != "":
            return value
    return default


@app.route("/api/update", methods=["POST"])
def api_update():
    payload = request.get_json(silent=True) or request.form
    api_key = payload.get("api_key")

    if api_key != DEFAULT_API_KEY:
        return jsonify({"success": False, "message": "Invalid API key"}), 401

    try:
        patient_id = int(payload.get("patient_id"))
        # Accept a few common names so older ESP32 sketches still work.
        weight_raw = first_payload_value(
            payload,
            "weight_g",
            "weight",
            "total_weight",
            "total_weight_g",
            "current_weight",
            "current_weight_g",
            "load_cell_weight_g",
            "hx711_weight_g",
        )
        weight_g = float(weight_raw)
        drops_per_min = float(first_payload_value(payload, "drops_per_min", "drop_rate", "drip_rate", default=0) or 0)
        drop_count = int(float(first_payload_value(payload, "drop_count", "total_drops", default=0) or 0))
    except (TypeError, ValueError):
        return jsonify({"success": False, "message": "patient_id and weight_g/weight are required"}), 400

    drip_status = payload.get("drip_status") or get_drip_status(drops_per_min)

    patient = PatientSlot.query.get(patient_id)
    if not patient or patient.id not in [p.id for p in PatientSlot.query.order_by(PatientSlot.id).limit(2).all()]:
        return jsonify({"success": False, "message": "Only Patient 1 and Patient 2 are active in this dashboard"}), 404

    save_reading(
        patient,
        weight_g,
        drops_per_min=drops_per_min,
        drop_count=drop_count,
        drip_status=drip_status,
        source="esp32",
    )

    return jsonify(
        {
            "success": True,
            "patient_id": patient.id,
            "weight_g": patient.current_weight_g,
            "raw_weight_received_g": weight_g,
            "level_percent": patient.current_level_percent,
            "status": patient.current_status,
            "drops_per_min": patient.current_drop_rate,
            "flow_rate_ml_hr": patient.current_flow_rate_ml_hr,
            "drip_status": patient.current_drip_status,
            "last_update_time": normalize_dt(patient.last_update_time).isoformat(),
        }
    )


@app.route("/api/patient/<int:patient_id>")
def api_patient(patient_id):
    patient = PatientSlot.query.get_or_404(patient_id)
    readings = get_readings(patient.id, limit=30)
    return jsonify(patient_payload(patient, readings))


@app.route("/api/dashboard-data")
def api_dashboard_data():
    return jsonify(build_dashboard_payload())


# Compatibility endpoint for the previous dashboard JS.
@app.route("/api/dashboard-data/<int:patient_id>")
def api_dashboard_data_old(patient_id):
    return jsonify(build_dashboard_payload())


def get_drip_status(drops_per_min):
    if drops_per_min <= 0:
        return "No Drip"
    if drops_per_min < 10:
        return "Slow"
    if drops_per_min > 80:
        return "Fast"
    return "Normal"


def get_readings(patient_id, limit=30):
    return (
        Reading.query.filter_by(patient_id=patient_id)
        .order_by(Reading.created_at.desc())
        .limit(limit)
        .all()[::-1]
    )


def patient_payload(patient, readings=None):
    readings = readings if readings is not None else get_readings(patient.id, limit=30)
    current_weight = max(float(patient.current_weight_g or 0), 0.0)
    full_weight = max(float(patient.full_weight_g or 0), 0.0)
    empty_weight = max(float(patient.empty_weight_g or 0), 0.0)
    # Remaining fluid follows the current measured weight shown by ESP32.
    # Empty bag weight is displayed separately as a calibration/reference value.
    remaining_weight = current_weight
    return {
        "id": patient.id,
        "patient_code": f"PT{patient.id:03d}",
        "patient_name": patient.patient_name,
        "bed_number": patient.bed_number,
        "ward_number": patient.ward_number or "Ward 3A",
        "current_weight_g": round(current_weight, 2),
        "remaining_weight_g": round(remaining_weight, 2),
        "current_level_percent": round(max(patient.current_level_percent or 0, 0), 2),
        "current_status": patient.current_status or "Normal",
        "current_drop_rate": round(patient.current_drop_rate or 0, 2),
        "current_flow_rate_ml_hr": round(patient.current_flow_rate_ml_hr or 0, 2),
        "current_drip_status": patient.current_drip_status or "Normal",
        "last_update_time": format_time(patient.last_update_time),
        "last_update_full": format_dt(patient.last_update_time, "%d/%m/%Y, %I:%M:%S %p"),
        "full_weight_g": round(full_weight, 2),
        "empty_weight_g": round(empty_weight, 2),
        "readings": [
            {
                "label": format_dt(r.created_at, "%I:%M %p"),
                "time": format_dt(r.created_at, "%d/%m/%Y, %I:%M:%S %p"),
                "weight_g": round(max(r.weight_g or 0, 0), 2),
                "level_percent": round(max(r.level_percent or 0, 0), 2),
                "status": r.status or "Normal",
                "drops_per_min": round(max(r.drops_per_min or 0, 0), 2),
                "flow_rate_ml_hr": round(max(r.flow_rate_ml_hr or 0, 0), 2),
                "drip_status": r.drip_status or "Normal",
                "source": r.source or "system",
            }
            for r in readings
        ],
    }


def build_dashboard_payload():
    patients = PatientSlot.query.order_by(PatientSlot.id).limit(2).all()
    patient_items = [patient_payload(p) for p in patients]
    alerts = Alert.query.order_by(desc(Alert.created_at)).limit(50).all()

    chart_labels = []
    if patient_items:
        # Use labels from patient with the longest reading list.
        longest = max(patient_items, key=lambda item: len(item["readings"]))
        chart_labels = [r["label"] for r in longest["readings"]]

    return {
        "server_time": format_time(utcnow()),
        "server_date": format_dt(utcnow(), "%d %B %Y"),
        "patients": patient_items,
        "alerts": [
            {
                "id": a.id,
                "patient_id": a.patient_id,
                "patient_name": (PatientSlot.query.get(a.patient_id).patient_name if PatientSlot.query.get(a.patient_id) else f"Patient {a.patient_id}"),
                "level_percent": round(a.level_percent or 0, 2),
                "alert_type": a.alert_type,
                "message": a.message,
                "created_at": format_time(a.created_at),
                "created_at_full": format_dt(a.created_at),
                "acknowledged": a.acknowledged,
            }
            for a in alerts
        ],
        "drop_comparison": {
            "labels": chart_labels,
            "series": [
                {
                    "patient_id": item["id"],
                    "patient_name": item["patient_name"],
                    "drops": [r["drops_per_min"] for r in item["readings"]],
                }
                for item in patient_items
            ],
        },
        "system": {
            "data_source": "PostgreSQL / Render Cloud" if "postgresql" in DATABASE_URL else "SQLite Local Test",
            "connected": True,
        },
    }


@app.route("/export/excel")
def export_excel():
    patients = PatientSlot.query.order_by(PatientSlot.id).limit(2).all()
    readings = Reading.query.order_by(Reading.created_at.desc()).all()
    alerts = Alert.query.order_by(Alert.created_at.desc()).all()

    patient_rows = [
        {
            "Patient ID": p.id,
            "Patient Code": f"PT{p.id:03d}",
            "Patient Name": p.patient_name,
            "Ward": p.ward_number,
            "Bed Number": p.bed_number,
            "Current IV Weight (g)": p.current_weight_g,
            "IV Level (%)": p.current_level_percent,
            "IV Status": p.current_status,
            "Drop Rate (drops/min)": p.current_drop_rate,
            "Flow Rate (ml/hr)": p.current_flow_rate_ml_hr,
            "Drip Status": p.current_drip_status,
            "Last Update Time": format_dt(p.last_update_time),
            "Full Weight (g)": p.full_weight_g,
            "Empty Weight (g)": p.empty_weight_g,
        }
        for p in patients
    ]

    reading_rows = [
        {
            "Reading ID": r.id,
            "Patient ID": r.patient_id,
            "Weight (g)": r.weight_g,
            "Level (%)": r.level_percent,
            "IV Status": r.status,
            "Drop Count": r.drop_count,
            "Drop Rate (drops/min)": r.drops_per_min,
            "Flow Rate (ml/hr)": r.flow_rate_ml_hr,
            "Drip Status": r.drip_status,
            "Source": r.source,
            "Created At": format_dt(r.created_at),
        }
        for r in readings
    ]

    alert_rows = [
        {
            "Alert ID": a.id,
            "Patient ID": a.patient_id,
            "Alert Type": a.alert_type,
            "Level (%)": a.level_percent,
            "Message": a.message,
            "Created At": format_dt(a.created_at),
            "Acknowledged": a.acknowledged,
        }
        for a in alerts
    ]

    output = BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        pd.DataFrame(patient_rows).to_excel(writer, sheet_name="Current Status", index=False)
        pd.DataFrame(reading_rows).to_excel(writer, sheet_name="Historical Readings", index=False)
        pd.DataFrame(alert_rows).to_excel(writer, sheet_name="Alerts", index=False)

    output.seek(0)
    timestamp = malaysia_now().strftime("%Y%m%d_%H%M%S")

    return send_file(
        output,
        as_attachment=True,
        download_name=f"iv_monitoring_data_{timestamp}.xlsx",
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@app.route("/acknowledge-alert/<int:alert_id>", methods=["POST"])
def acknowledge_alert(alert_id):
    alert = Alert.query.get_or_404(alert_id)
    alert.acknowledged = True
    db.session.commit()
    return redirect(url_for("dashboard"))


def latest_valid_weight(patient):
    """Return a previous valid weight if ESP32 briefly sends an invalid tiny value."""
    # Avoid locking the dashboard at 1 ml when HX711 returns -1 / 0 / tiny noise.
    # A real IV bag reading should normally be well above this threshold.
    min_valid_weight = 5.0
    current = float(patient.current_weight_g or 0)
    if current > min_valid_weight:
        return current
    latest = (
        Reading.query.filter(Reading.patient_id == patient.id, Reading.weight_g > min_valid_weight)
        .order_by(Reading.created_at.desc())
        .first()
    )
    if latest:
        return float(latest.weight_g or 0)
    return float(patient.full_weight_g or 550.0)


def clean_incoming_weight(patient, weight_g, drops_per_min=0.0, source="system"):
    """Clean load-cell value before saving.

    FINAL FIX: the dashboard must follow the ESP32 Serial Monitor exactly.
    If ESP32 sends 0.00 g, the website saves 0.00 g. It will not keep the
    previous valid value anymore, because that made the graph show old values
    such as 19 g / 25 g while Serial Monitor already showed 0 g.
    """
    try:
        weight = float(weight_g)
    except (TypeError, ValueError):
        weight = 0.0

    # Negative values are not a real IV weight. Clamp to zero so the website
    # matches a zero/empty reading instead of displaying a previous value.
    if weight < 0:
        weight = 0.0

    # Remove tiny HX711 noise only. A real 0.00 g reading remains 0.00 g.
    if abs(weight) < 1.0:
        weight = 0.0

    return round(max(weight, 0.0), 2)


def save_reading(patient, weight_g, drops_per_min=0.0, drop_count=0, drip_status=None, source="system"):
    now = utcnow()
    drops_per_min = round(float(drops_per_min or 0), 2)
    weight_g = clean_incoming_weight(patient, weight_g, drops_per_min=drops_per_min, source=source)
    level = calculate_level(weight_g, patient.empty_weight_g, patient.full_weight_g)
    status = get_status(level)
    flow_rate_ml_hr = calculate_flow_rate(drops_per_min)
    drip_status = drip_status or get_drip_status(drops_per_min)

    patient.current_weight_g = round(weight_g, 2)
    patient.current_level_percent = level
    patient.current_status = status
    patient.current_drop_rate = drops_per_min
    patient.current_flow_rate_ml_hr = flow_rate_ml_hr
    patient.current_drip_status = drip_status
    patient.last_update_time = now

    db.session.add(
        Reading(
            patient_id=patient.id,
            weight_g=round(weight_g, 2),
            level_percent=level,
            status=status,
            drop_count=drop_count,
            drops_per_min=drops_per_min,
            flow_rate_ml_hr=flow_rate_ml_hr,
            drip_status=drip_status,
            source=source,
            created_at=now,
        )
    )

    create_alert_if_needed(patient)
    db.session.commit()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 5000)), debug=True)
