import os
from io import BytesIO
from datetime import datetime

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
from sqlalchemy import desc

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "iv-monitor-secret-key")

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///iv_monitor.db")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

app.config["SQLALCHEMY_DATABASE_URI"] = DATABASE_URL
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db = SQLAlchemy(app)

MONITOR_OPTIONS = ["Fariz", "Ku Lee Chin", "Hareny"]
DEFAULT_API_KEY = os.getenv("API_KEY", "IVMONITOR123")


class MonitorLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    monitor_name = db.Column(db.String(100), nullable=False)
    login_time = db.Column(db.DateTime, default=datetime.now, nullable=False)


class PatientSlot(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    patient_name = db.Column(db.String(120), nullable=False)
    bed_number = db.Column(db.String(50), nullable=False)
    full_weight_g = db.Column(db.Float, nullable=False, default=550.0)
    empty_weight_g = db.Column(db.Float, nullable=False, default=50.0)
    current_weight_g = db.Column(db.Float, nullable=False, default=550.0)
    current_level_percent = db.Column(db.Float, nullable=False, default=100.0)
    current_status = db.Column(db.String(20), nullable=False, default="Normal")
    last_update_time = db.Column(db.DateTime, default=datetime.now, nullable=False)


class Reading(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.Integer, db.ForeignKey("patient_slot.id"), nullable=False)
    weight_g = db.Column(db.Float, nullable=False)
    level_percent = db.Column(db.Float, nullable=False)
    status = db.Column(db.String(20), nullable=False)
    source = db.Column(db.String(30), nullable=False, default="system")
    created_at = db.Column(db.DateTime, default=datetime.now, nullable=False)


class Alert(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.Integer, db.ForeignKey("patient_slot.id"), nullable=False)
    level_percent = db.Column(db.Float, nullable=False)
    alert_type = db.Column(db.String(20), nullable=False)
    message = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.now, nullable=False)
    acknowledged = db.Column(db.Boolean, default=False, nullable=False)


def utcnow():
    return datetime.now()


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


def calculate_level(current_weight, empty_weight, full_weight):
    denominator = max(full_weight - empty_weight, 1)
    percent = ((current_weight - empty_weight) / denominator) * 100
    percent = max(0.0, min(100.0, percent))
    return round(percent, 2)


def get_status(level_percent):
    if level_percent < 10:
        return "Critical"
    if level_percent <= 30:
        return "Low"
    return "Normal"


def create_alert_if_needed(patient):
    if patient.current_status not in ["Low", "Critical"]:
        return

    cutoff_minutes = 10
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
        f"Patient ID {patient.id} ({patient.patient_name}) IV bag is {patient.current_status.lower()} "
        f"at {patient.current_level_percent:.1f}%"
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


def seed_database():
    if PatientSlot.query.count() == 0:
        default_names = [
            "Patient 1",
            "Patient 2",
            "Patient 3",
            "Patient 4",
            "Patient 5",
        ]

        for i in range(5):
            patient = PatientSlot(
                patient_name=default_names[i],
                bed_number=f"Bed {i + 1}",
                full_weight_g=550.0,
                empty_weight_g=50.0,
                current_weight_g=550.0,
                current_level_percent=100.0,
                current_status="Normal",
                last_update_time=utcnow(),
            )
            db.session.add(patient)

        db.session.commit()

        for patient in PatientSlot.query.order_by(PatientSlot.id).all():
            db.session.add(
                Reading(
                    patient_id=patient.id,
                    weight_g=patient.current_weight_g,
                    level_percent=patient.current_level_percent,
                    status=patient.current_status,
                    source="seed",
                    created_at=utcnow(),
                )
            )

        db.session.commit()


@app.before_request
def ensure_db_ready():
    db.create_all()
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
    return render_template("login.html")


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
        return redirect(url_for("index"))

    session["monitor_name"] = monitor_name
    db.session.add(MonitorLog(monitor_name=monitor_name, login_time=utcnow()))
    db.session.commit()
    return redirect(url_for("dashboard", patient_id=1))


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("index"))


@app.route("/dashboard")
def dashboard():
    if "monitor_name" not in session:
        return redirect(url_for("index"))

    patient_id = request.args.get("patient_id", default=1, type=int)
    selected_patient = PatientSlot.query.get(patient_id) or PatientSlot.query.order_by(PatientSlot.id).first()
    patients = PatientSlot.query.order_by(PatientSlot.id).all()
    alerts = Alert.query.order_by(desc(Alert.created_at)).limit(10).all()

    readings = (
        Reading.query.filter_by(patient_id=selected_patient.id)
        .order_by(Reading.created_at.asc())
        .limit(100)
        .all()
    )

    chart_labels = [format_dt(r.created_at, "%d/%m %H:%M:%S") for r in readings]
    chart_weights = [round(r.weight_g, 2) for r in readings]
    chart_levels = [round(r.level_percent, 2) for r in readings]

    return render_template(
        "dashboard.html",
        patients=patients,
        selected_patient=selected_patient,
        alerts=alerts,
        chart_labels=chart_labels,
        chart_weights=chart_weights,
        chart_levels=chart_levels,
        now_utc=utcnow(),
    )


@app.route("/update-patient/<int:patient_id>", methods=["POST"])
def update_patient(patient_id):
    patient = PatientSlot.query.get_or_404(patient_id)
    patient.patient_name = request.form.get("patient_name", patient.patient_name).strip() or patient.patient_name
    patient.bed_number = request.form.get("bed_number", patient.bed_number).strip() or patient.bed_number
    patient.full_weight_g = float(request.form.get("full_weight_g", patient.full_weight_g))
    patient.empty_weight_g = float(request.form.get("empty_weight_g", patient.empty_weight_g))

    patient.current_level_percent = calculate_level(
        patient.current_weight_g, patient.empty_weight_g, patient.full_weight_g
    )
    patient.current_status = get_status(patient.current_level_percent)

    db.session.commit()
    create_alert_if_needed(patient)
    db.session.commit()

    return redirect(url_for("dashboard", patient_id=patient.id))


@app.route("/manual-reading/<int:patient_id>", methods=["POST"])
def manual_reading(patient_id):
    patient = PatientSlot.query.get_or_404(patient_id)

    try:
        weight_g = float(request.form.get("weight_g"))
    except (TypeError, ValueError):
        flash("Invalid weight value.")
        return redirect(url_for("dashboard", patient_id=patient.id))

    save_reading(patient, weight_g, source="manual")
    return redirect(url_for("dashboard", patient_id=patient.id))


@app.route("/api/update", methods=["POST"])
def api_update():
    payload = request.get_json(silent=True) or request.form
    api_key = payload.get("api_key")

    if api_key != DEFAULT_API_KEY:
        return jsonify({"success": False, "message": "Invalid API key"}), 401

    try:
        patient_id = int(payload.get("patient_id"))
        weight_g = float(payload.get("weight_g"))
    except (TypeError, ValueError):
        return jsonify({"success": False, "message": "patient_id and weight_g are required"}), 400

    patient = PatientSlot.query.get(patient_id)
    if not patient:
        return jsonify({"success": False, "message": "Patient slot not found"}), 404

    save_reading(patient, weight_g, source="esp32")

    return jsonify(
        {
            "success": True,
            "patient_id": patient.id,
            "weight_g": patient.current_weight_g,
            "level_percent": patient.current_level_percent,
            "status": patient.current_status,
            "last_update_time": normalize_dt(patient.last_update_time).isoformat(),
        }
    )


@app.route("/api/patient/<int:patient_id>")
def api_patient(patient_id):
    patient = PatientSlot.query.get_or_404(patient_id)

    readings = (
        Reading.query.filter_by(patient_id=patient.id)
        .order_by(Reading.created_at.desc())
        .limit(20)
        .all()
    )

    return jsonify(
        {
            "id": patient.id,
            "patient_name": patient.patient_name,
            "bed_number": patient.bed_number,
            "current_weight_g": patient.current_weight_g,
            "current_level_percent": patient.current_level_percent,
            "current_status": patient.current_status,
            "last_update_time": normalize_dt(patient.last_update_time).isoformat(),
            "readings": [
                {
                    "weight_g": r.weight_g,
                    "level_percent": r.level_percent,
                    "status": r.status,
                    "created_at": normalize_dt(r.created_at).isoformat(),
                }
                for r in readings
            ],
        }
    )


@app.route("/api/dashboard-data/<int:patient_id>")
def api_dashboard_data(patient_id):
    patient = PatientSlot.query.get_or_404(patient_id)
    patients = PatientSlot.query.order_by(PatientSlot.id).all()
    alerts = Alert.query.order_by(desc(Alert.created_at)).limit(10).all()

    readings = (
        Reading.query.filter_by(patient_id=patient.id)
        .order_by(Reading.created_at.asc())
        .limit(100)
        .all()
    )

    return jsonify(
        {
            "selected_patient": {
                "id": patient.id,
                "patient_name": patient.patient_name,
                "bed_number": patient.bed_number,
                "current_weight_g": round(patient.current_weight_g, 2),
                "current_level_percent": round(patient.current_level_percent, 2),
                "current_status": patient.current_status,
                "last_update_time": format_dt(patient.last_update_time),
                "full_weight_g": round(patient.full_weight_g, 2),
                "empty_weight_g": round(patient.empty_weight_g, 2),
            },
            "patients": [
                {
                    "id": p.id,
                    "patient_name": p.patient_name,
                    "bed_number": p.bed_number,
                    "current_weight_g": round(p.current_weight_g, 2),
                    "current_level_percent": round(p.current_level_percent, 2),
                    "current_status": p.current_status,
                }
                for p in patients
            ],
            "alerts": [
                {
                    "id": a.id,
                    "patient_id": a.patient_id,
                    "alert_type": a.alert_type,
                    "message": a.message,
                    "created_at": format_dt(a.created_at),
                    "acknowledged": a.acknowledged,
                }
                for a in alerts
            ],
            "chart": {
                "labels": [format_dt(r.created_at, "%d/%m %H:%M:%S") for r in readings],
                "weights": [round(r.weight_g, 2) for r in readings],
                "levels": [round(r.level_percent, 2) for r in readings],
            },
        }
    )


@app.route("/export/excel")
def export_excel():
    patients = PatientSlot.query.order_by(PatientSlot.id).all()
    readings = Reading.query.order_by(Reading.created_at.desc()).all()
    alerts = Alert.query.order_by(Alert.created_at.desc()).all()

    patient_rows = [
        {
            "Patient ID": p.id,
            "Patient Name": p.patient_name,
            "Bed Number": p.bed_number,
            "Current IV Weight (g)": p.current_weight_g,
            "IV Level (%)": p.current_level_percent,
            "Status": p.current_status,
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
            "Status": r.status,
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
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

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
    return redirect(url_for("dashboard", patient_id=request.form.get("patient_id", 1)))


def save_reading(patient, weight_g, source="system"):
    now = utcnow()
    level = calculate_level(weight_g, patient.empty_weight_g, patient.full_weight_g)
    status = get_status(level)

    patient.current_weight_g = round(weight_g, 2)
    patient.current_level_percent = level
    patient.current_status = status
    patient.last_update_time = now

    db.session.add(
        Reading(
            patient_id=patient.id,
            weight_g=round(weight_g, 2),
            level_percent=level,
            status=status,
            source=source,
            created_at=now,
        )
    )

    create_alert_if_needed(patient)
    db.session.commit()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 5000)), debug=True)