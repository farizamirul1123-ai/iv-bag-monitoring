(function () {
    const charts = {};
    const colors = { teal: 'rgba(6,152,169,1)', orange: 'rgba(255,123,24,1)', red: 'rgba(255,65,65,1)' };
    const IV_CAPACITY_ML = 500;
    const QUARTER_VOLUME_ML = IV_CAPACITY_ML / 4;
    const lastQuarterByPatient = {};
    const activeEmptyAlarmPatients = new Set();
    let audioCtx = null;
    let emptyAlarmTimer = null;
    let audioUnlocked = false;

    // Browser-only sound system:
    // - 0/4 or critical empty level = repeating phone-style alarm
    // - 1/4, 2/4, 3/4, 4/4 = short phone notification tones
    const EMPTY_ALARM_THRESHOLD_ML = 50;
    const NEW_BAG_RESET_THRESHOLD_ML = 80;
    const BAG_REMOVED_STORAGE_KEY = 'ivBagRemovedAcknowledged';

    function lang() { return document.body.dataset.initialLanguage || 'en'; }
    function dict() { return (window.TRANSLATIONS && (TRANSLATIONS[lang()] || TRANSLATIONS.en)) || {}; }
    function t(key, fallback) { return dict()[key] || fallback || key; }
    function pad(v) { return String(v).padStart(2, '0'); }

    function clock(date) {
        let h = date.getHours();
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12 || 12;
        return `${pad(h)}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${ampm}`;
    }

    function dateText(date) {
        return date.toLocaleDateString(lang() === 'ms' ? 'ms-MY' : 'en-MY', {
            day: '2-digit', month: 'long', year: 'numeric'
        });
    }

    function updateClock() {
        const now = new Date();
        ['localClock', 'monitorClock'].forEach(id => {
            const e = document.getElementById(id);
            if (e) e.textContent = clock(now);
        });
        ['localDate', 'monitorDate'].forEach(id => {
            const e = document.getElementById(id);
            if (e) e.textContent = dateText(now);
        });
    }

    function translateStatic() {
        document.documentElement.lang = lang() === 'ms' ? 'ms' : 'en';
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (t(key)) el.textContent = t(key);
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (t(key)) el.setAttribute('placeholder', t(key));
        });
    }

    function setText(selector, value) {
        document.querySelectorAll(selector).forEach(e => { e.textContent = value; });
    }

    function normStatus(raw) {
        const s = String(raw || '').toLowerCase();
        if (s.includes('critical') || s.includes('kritikal')) return 'Critical';
        if (s.includes('low') || s.includes('rendah')) return 'Low';
        return 'Normal';
    }

    function statusLabel(status) {
        const s = normStatus(status);
        return t(s.toLowerCase(), s);
    }

    function displayPatientName(name, id) {
        if (lang() === 'ms') {
            if (String(name).trim().toLowerCase() === 'patient a') return t('patientA', 'Pesakit A');
            if (String(name).trim().toLowerCase() === 'patient b') return t('patientB', 'Pesakit B');
        }
        return name || `${t('patient', 'Patient')} ${id}`;
    }

    function setStatusClass(el, status) {
        el.classList.remove('status-normal', 'status-low', 'status-critical');
        el.classList.add(status === 'Critical' ? 'status-critical' : status === 'Low' ? 'status-low' : 'status-normal');
    }

    function fmtWeight(value, unit) {
        const n = Math.max(0, Math.min(unit === 'ml' ? IV_CAPACITY_ML : Number.MAX_SAFE_INTEGER, Number(value || 0)));
        return `${Math.round(n).toLocaleString()} ${unit || 'g'}`;
    }

    function clampVolume(value) { return Math.max(0, Math.min(IV_CAPACITY_ML, Number(value || 0))); }

    function quarterFromVolume(value) {
        const volume = clampVolume(value);
        if (volume <= 0.5) return 0;
        return Math.max(1, Math.min(4, Math.ceil(volume / QUARTER_VOLUME_ML)));
    }

    function quarterText(quarter) { return quarter > 0 ? `${quarter}/4` : '0/4'; }

    function blinkText(quarter) {
        if (quarter <= 0) return t('emptyAlarmSound', 'Empty alarm');
        return `${quarter} ${t('notificationSound', 'phone notification')}`;
    }

    function soundEnabled() {
        try {
            const saved = JSON.parse(localStorage.getItem('ivNotificationPreferences') || 'null');
            if (Array.isArray(saved) && saved.length > 2) return Boolean(saved[2]);
        } catch (e) { }
        const toggles = document.querySelectorAll('[data-toggle-pref] .toggle');
        return !toggles[2] || toggles[2].classList.contains('on');
    }

    function ensureAudio() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return null;
            if (!audioCtx) audioCtx = new AudioContext();
            if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
            return audioCtx;
        } catch (e) { return null; }
    }

    function playTone(start, freqStart, freqEnd, duration, volume) {
        const ctx = ensureAudio();
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freqStart, start);
        if (freqEnd && freqEnd !== freqStart) {
            osc.frequency.exponentialRampToValueAtTime(freqEnd, start + Math.max(0.03, duration * 0.72));
        }
        gain.gain.setValueAtTime(0.001, start);
        gain.gain.exponentialRampToValueAtTime(volume || 0.16, start + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + duration + 0.03);
    }

    function playPhoneNotification(count) {
        if (!soundEnabled() || count <= 0) return;
        const ctx = ensureAudio();
        if (!ctx) return;
        const repeats = Math.max(1, Math.min(4, Number(count || 1)));
        for (let i = 0; i < repeats; i++) {
            const base = ctx.currentTime + (i * 0.46);
            // A short two-note notification, closer to a phone notification than a buzzer beep.
            playTone(base, 1046.5, 1396.9, 0.16, 0.13);
            playTone(base + 0.18, 1568.0, 1975.5, 0.18, 0.10);
        }
    }

    function playEmptyAlarmPulse() {
        if (!soundEnabled() || !activeEmptyAlarmPatients.size) return;
        const ctx = ensureAudio();
        if (!ctx) return;
        const base = ctx.currentTime;
        // Repeating phone-alarm style: rising and falling urgent tones.
        playTone(base, 760, 1280, 0.34, 0.20);
        playTone(base + 0.38, 1280, 760, 0.34, 0.20);
        playTone(base + 0.86, 760, 1280, 0.34, 0.20);
        playTone(base + 1.24, 1280, 760, 0.34, 0.20);
    }

    function startEmptyAlarm(id, name) {
        const before = activeEmptyAlarmPatients.size;
        activeEmptyAlarmPatients.add(String(id));
        if (before === activeEmptyAlarmPatients.size) return;
        pulseQuarterIndicator(id);
        toast(`${name}: ${t('emptyAlarmToast', 'IV bag empty / critical - alarm active')}`);
        playEmptyAlarmPulse();
        if (!emptyAlarmTimer) {
            emptyAlarmTimer = setInterval(playEmptyAlarmPulse, 2200);
        }
    }

    function stopEmptyAlarm(id) {
        activeEmptyAlarmPatients.delete(String(id));
        if (!activeEmptyAlarmPatients.size && emptyAlarmTimer) {
            clearInterval(emptyAlarmTimer);
            emptyAlarmTimer = null;
        }
    }

    function readBagRemovedMap() {
        try {
            const saved = JSON.parse(localStorage.getItem(BAG_REMOVED_STORAGE_KEY) || '{}');
            return saved && typeof saved === 'object' ? saved : {};
        } catch (e) { return {}; }
    }

    function writeBagRemovedMap(map) {
        try { localStorage.setItem(BAG_REMOVED_STORAGE_KEY, JSON.stringify(map || {})); }
        catch (e) { console.warn('Bag removed state save failed', e); }
    }

    function isBagRemovedAcknowledged(id) {
        return Boolean(readBagRemovedMap()[String(id)]);
    }

    function setBagRemovedAcknowledged(id, value) {
        const key = String(id);
        const map = readBagRemovedMap();
        if (value) map[key] = true;
        else delete map[key];
        writeBagRemovedMap(map);
        updateBagSessionUI(id, Boolean(value));
    }

    function updateBagSessionUI(id, acknowledged) {
        document.querySelectorAll(`[data-action="stop-empty-alarm"][data-patient-id="${id}"]`).forEach(btn => {
            btn.classList.toggle('stopped', Boolean(acknowledged));
            const span = btn.querySelector('span');
            if (span) span.textContent = acknowledged ? t('waitingNewBag', 'Waiting for new IV bag') : t('stopAlarmBagRemoved', 'Stop Alarm / Bag Removed');
        });
        document.querySelectorAll(`[data-bag-session-note="${id}"]`).forEach(note => {
            note.textContent = acknowledged ? t('alarmStopped', 'Alarm stopped. Bag removed mode is active.') : '';
        });
    }

    function resetBagRemovedIfNewBag(id, remainingMl, name) {
        if (remainingMl >= NEW_BAG_RESET_THRESHOLD_ML && isBagRemovedAcknowledged(id)) {
            setBagRemovedAcknowledged(id, false);
            lastQuarterByPatient[id] = undefined;
            toast(`${name}: ${t('newBagDetected', 'New IV bag detected. Monitoring restarted.')}`);
        }
    }

    function stopAlarmForPatient(id) {
        setBagRemovedAcknowledged(id, true);
        stopEmptyAlarm(id);
        pulseQuarterIndicator(id);
        toast(t('alarmStopped', 'Alarm stopped. Bag removed mode is active.'));
    }


    function playCurrentStatusSoundsAfterUnlock() {
        const data = window.__LAST_DASHBOARD_DATA__;
        if (!data || !Array.isArray(data.patients)) return;
        data.patients.forEach(p => {
            const id = p.id;
            const name = displayPatientName(p.patient_name, id);
            const remainingMl = clampVolume(p.remaining_weight_g ?? p.current_weight_g);
            const quarter = Number.isFinite(Number(p.volume_quarter)) ? Number(p.volume_quarter) : quarterFromVolume(remainingMl);
            const status = normStatus(p.current_status);
            resetBagRemovedIfNewBag(id, remainingMl, name);
            const emptyOrCritical = quarter <= 0 || remainingMl <= EMPTY_ALARM_THRESHOLD_ML || status === 'Critical';
            if (emptyOrCritical && !isBagRemovedAcknowledged(id)) {
                startEmptyAlarm(id, name);
            } else {
                stopEmptyAlarm(id);
                if (quarter > 0 && !isBagRemovedAcknowledged(id)) playPhoneNotification(quarter);
            }
        });
    }

    function unlockAudioAndPreview() {
        if (audioUnlocked) return;
        audioUnlocked = true;
        ensureAudio();
        setTimeout(playCurrentStatusSoundsAfterUnlock, 80);
    }

    function pulseQuarterIndicator(id) {
        document.querySelectorAll(`[data-dashboard-patient-card="${id}"], [data-monitor-patient-panel="${id}"], [data-patient-quarter="${id}"]`).forEach(el => {
            el.classList.remove('quarter-alert-pulse');
            void el.offsetWidth;
            el.classList.add('quarter-alert-pulse');
        });
    }

    function handleQuarterNotification(id, quarter, name, remainingMl, status) {
        if (!Number.isFinite(quarter)) return;

        const safeRemaining = clampVolume(remainingMl);
        resetBagRemovedIfNewBag(id, safeRemaining, name);
        const acknowledgedRemoved = isBagRemovedAcknowledged(id);
        updateBagSessionUI(id, acknowledgedRemoved);

        const emptyOrCritical = quarter <= 0 || safeRemaining <= EMPTY_ALARM_THRESHOLD_ML || normStatus(status) === 'Critical';
        if (emptyOrCritical && !acknowledgedRemoved) {
            startEmptyAlarm(id, name);
        } else {
            stopEmptyAlarm(id);
        }

        if (lastQuarterByPatient[id] === undefined) {
            lastQuarterByPatient[id] = quarter;
            return;
        }
        if (lastQuarterByPatient[id] === quarter) return;
        lastQuarterByPatient[id] = quarter;
        pulseQuarterIndicator(id);

        if (quarter > 0) {
            playPhoneNotification(quarter);
            toast(`${name}: ${quarterText(quarter)} - ${blinkText(quarter)}`);
        }
    }

    function patientColor(id) { return Number(id) % 2 === 0 ? colors.orange : colors.teal; }

    function makeGradient(ctx, color) {
        const g = ctx.createLinearGradient(0, 0, 0, 180);
        g.addColorStop(0, color.replace('1)', '.22)'));
        g.addColorStop(1, color.replace('1)', '0)'));
        return g;
    }

    function niceMax(vals, min = 100) {
        const list = Array.isArray(vals) ? vals : [vals];
        const m = Math.max(min, ...list.map(v => Number(v || 0)));
        const step = m > 1000 ? 250 : m > 500 ? 100 : 50;
        return Math.ceil((m * 1.12) / step) * step;
    }

    function chartOptions() {
        return {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 300 },
            interaction: { mode: 'index', intersect: false },
            layout: { padding: { top: 4, right: 10, bottom: 0, left: 0 } },
            plugins: {
                legend: { display: false },
                tooltip: { backgroundColor: '#082987', padding: 10, cornerRadius: 10 }
            },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#405b9b', maxRotation: 0, autoSkip: true, maxTicksLimit: 7, font: { size: 11, weight: '600' } } },
                y: { beginAtZero: true, grid: { color: 'rgba(8,41,135,.08)' }, ticks: { color: '#405b9b', font: { size: 11, weight: '600' } } }
            }
        };
    }

    function drawFallbackLine(canvasId, labels, values, color, label, yMin, fixedMax) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const parent = canvas.parentElement;
        const dpr = window.devicePixelRatio || 1;
        const width = Math.max(260, parent ? parent.clientWidth - 36 : canvas.clientWidth || 360);
        const height = Math.max(150, parent ? parent.clientHeight - 52 : canvas.clientHeight || 180);
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);

        const nums = (values || []).map(v => Number(v || 0));
        const labs = labels && labels.length ? labels : nums.map((_, i) => String(i + 1));
        const maxVal = fixedMax || niceMax(nums, yMin || 50);
        const padL = 42, padR = 12, padT = 12, padB = 28;
        const plotW = width - padL - padR;
        const plotH = height - padT - padB;

        ctx.font = '600 11px Inter, Arial, sans-serif';
        ctx.strokeStyle = 'rgba(8,41,135,.10)';
        ctx.fillStyle = '#405b9b';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = padT + plotH * (i / 4);
            ctx.beginPath();
            ctx.moveTo(padL, y);
            ctx.lineTo(width - padR, y);
            ctx.stroke();
            const tick = Math.round(maxVal - (maxVal * i / 4));
            ctx.fillText(String(tick), 4, y + 4);
        }

        if (!nums.length) return;
        const points = nums.map((v, i) => {
            const x = padL + (nums.length === 1 ? plotW : plotW * i / (nums.length - 1));
            const y = padT + plotH - (Math.max(0, Math.min(maxVal, v)) / maxVal) * plotH;
            return { x, y, v };
        });

        const grad = ctx.createLinearGradient(0, padT, 0, height - padB);
        grad.addColorStop(0, color.replace('1)', '.18)'));
        grad.addColorStop(1, color.replace('1)', '0)'));
        ctx.beginPath();
        ctx.moveTo(points[0].x, height - padB);
        points.forEach(pt => ctx.lineTo(pt.x, pt.y));
        ctx.lineTo(points[points.length - 1].x, height - padB);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.beginPath();
        points.forEach((pt, i) => i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y));
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.fillStyle = color;
        points.forEach(pt => { ctx.beginPath(); ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2); ctx.fill(); });

        const step = Math.max(1, Math.ceil(labs.length / 6));
        ctx.fillStyle = '#405b9b';
        labs.forEach((lab, i) => {
            if (i % step !== 0 && i !== labs.length - 1) return;
            const pt = points[i];
            if (!pt) return;
            ctx.fillText(String(lab).replace(/^0/, ''), Math.max(0, pt.x - 18), height - 8);
        });
    }

    function createLine(canvasId, labels, values, color, label, yMin, fixedMax) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        if (!window.Chart) { drawFallbackLine(canvasId, labels, values, color, label, yMin, fixedMax); return; }
        const ctx = canvas.getContext('2d');
        const yMax = fixedMax || niceMax(values, yMin || 50);
        if (!charts[canvasId]) {
            charts[canvasId] = new Chart(ctx, {
                type: 'line',
                data: { labels, datasets: [{ label, data: values, borderColor: color, backgroundColor: makeGradient(ctx, color), borderWidth: 3, pointRadius: 2.2, pointHoverRadius: 5, tension: .32, fill: true }] },
                options: chartOptions()
            });
        } else {
            charts[canvasId].data.labels = labels;
            charts[canvasId].data.datasets[0].data = values;
            charts[canvasId].data.datasets[0].borderColor = color;
            charts[canvasId].data.datasets[0].backgroundColor = makeGradient(ctx, color);
            charts[canvasId].data.datasets[0].label = label;
        }
        charts[canvasId].options.scales.y.min = 0;
        charts[canvasId].options.scales.y.suggestedMax = yMax;
        if (fixedMax) {
            charts[canvasId].options.scales.y.max = fixedMax;
            charts[canvasId].options.scales.y.ticks.stepSize = fixedMax === IV_CAPACITY_ML ? 100 : 1;
        } else {
            delete charts[canvasId].options.scales.y.max;
            delete charts[canvasId].options.scales.y.ticks.stepSize;
        }
        charts[canvasId].update();
    }

    function createDropComparison(data) {
        const canvas = document.getElementById('dropComparisonChart');
        if (!canvas) return;
        if (!window.Chart) {
            const labels = (data.drop_comparison && data.drop_comparison.labels) || [];
            const series = (data.drop_comparison && data.drop_comparison.series) || [];
            const first = series[0] || { drops: [] };
            drawFallbackLine('dropComparisonChart', labels, (first.drops || []).map(v => Number(v || 0)), colors.teal, 'Drops/min', 40);
            return;
        }
        const labels = (data.drop_comparison && data.drop_comparison.labels) || [];
        const series = (data.drop_comparison && data.drop_comparison.series) || [];
        const datasets = series.map((s, i) => ({
            label: displayPatientName(s.patient_name, s.patient_id) || `${t('patient', 'Patient')} ${i + 1}`,
            data: (s.drops || []).map(v => Number(v || 0)),
            borderColor: i % 2 ? colors.orange : colors.teal,
            backgroundColor: 'transparent',
            borderWidth: 3,
            pointRadius: 2.2,
            pointHoverRadius: 5,
            tension: .32,
            fill: false
        }));
        const all = datasets.flatMap(d => d.data);
        const yMax = niceMax(all, 40);
        if (!charts.dropComparisonChart) {
            charts.dropComparisonChart = new Chart(canvas.getContext('2d'), {
                type: 'line',
                data: { labels, datasets },
                options: {
                    ...chartOptions(),
                    plugins: { legend: { display: true, position: 'top', align: 'end', labels: { usePointStyle: true, boxWidth: 8, color: '#082987', font: { weight: '700' } } }, tooltip: { backgroundColor: '#082987', padding: 10, cornerRadius: 10 } }
                }
            });
        } else {
            charts.dropComparisonChart.data.labels = labels;
            charts.dropComparisonChart.data.datasets = datasets;
        }
        charts.dropComparisonChart.options.scales.y.suggestedMax = yMax;
        charts.dropComparisonChart.update();
    }

    function createQuarterAnalysis(data) {
        const canvas = document.getElementById('quarterAnalysisChart');
        if (!canvas) return;
        const labels = (data.quarter_analysis && data.quarter_analysis.labels) || [];
        const series = (data.quarter_analysis && data.quarter_analysis.series) || [];
        if (!window.Chart) {
            const first = series[0] || { quarters: [] };
            drawFallbackLine('quarterAnalysisChart', labels, first.quarters || [], colors.teal, t('quarterNotification', 'Quarter Notification'), 4, 4);
            return;
        }
        const datasets = series.map((s, i) => ({
            label: displayPatientName(s.patient_name, s.patient_id) || `${t('patient', 'Patient')} ${i + 1}`,
            data: (s.quarters || []).map(v => Math.max(0, Math.min(4, Number(v || 0)))),
            borderColor: i % 2 ? colors.orange : colors.teal,
            backgroundColor: 'transparent',
            borderWidth: 3,
            pointRadius: 2.5,
            pointHoverRadius: 5,
            tension: .28,
            fill: false
        }));
        if (!charts.quarterAnalysisChart) {
            charts.quarterAnalysisChart = new Chart(canvas.getContext('2d'), {
                type: 'line',
                data: { labels, datasets },
                options: {
                    ...chartOptions(),
                    plugins: { legend: { display: true, position: 'top', align: 'end', labels: { usePointStyle: true, boxWidth: 8, color: '#082987', font: { weight: '700' } } }, tooltip: { backgroundColor: '#082987', padding: 10, cornerRadius: 10 } },
                    scales: {
                        x: { grid: { display: false }, ticks: { color: '#405b9b', maxRotation: 0, autoSkip: true, maxTicksLimit: 7, font: { size: 11, weight: '600' } } },
                        y: { min: 0, max: 4, ticks: { stepSize: 1, color: '#405b9b', callback: value => `${value}/4`, font: { size: 11, weight: '600' } }, grid: { color: 'rgba(8,41,135,.08)' } }
                    }
                }
            });
        } else {
            charts.quarterAnalysisChart.data.labels = labels;
            charts.quarterAnalysisChart.data.datasets = datasets;
        }
        charts.quarterAnalysisChart.update();
    }

    function updatePatient(p) {
        const id = p.id;
        const status = normStatus(p.current_status);
        const pct = Math.round(Number(p.current_level_percent || 0));
        const remainingMl = clampVolume(p.remaining_weight_g ?? p.current_weight_g);
        const quarter = Number.isFinite(Number(p.volume_quarter)) ? Number(p.volume_quarter) : quarterFromVolume(remainingMl);
        const color = status === 'Critical' ? colors.red : status === 'Low' ? colors.orange : patientColor(id);
        const name = displayPatientName(p.patient_name, id);

        setText(`[data-patient-name="${id}"]`, name);
        setText(`[data-patient-chart-name="${id}"]`, name);
        setText(`[data-patient-code="${id}"]`, p.patient_code || `PT${String(id).padStart(3, '0')}`);
        setText(`[data-patient-ward="${id}"]`, p.ward_number || 'Ward 3A');
        setText(`[data-patient-bed="${id}"]`, p.bed_number || '-');
        setText(`[data-patient-current-weight="${id}"]`, fmtWeight(p.current_weight_g, 'g'));
        setText(`[data-patient-remaining-weight="${id}"]`, fmtWeight(remainingMl, 'ml'));
        setText(`[data-patient-drop="${id}"]`, Math.round(Number(p.current_drop_rate || 0)));
        setText(`[data-patient-flow="${id}"]`, Math.round(Number(p.current_flow_rate_ml_hr || 0)));
        setText(`[data-patient-quarter="${id}"]`, quarterText(quarter));
        setText(`[data-patient-notification="${id}"]`, blinkText(quarter));
        setText(`[data-patient-updated="${id}"]`, p.last_update_time || p.last_update_full || '-');

        document.querySelectorAll(`[data-patient-level="${id}"]`).forEach(e => { e.textContent = `${pct}%`; e.style.color = color; });
        document.querySelectorAll(`[data-patient-progress="${id}"]`).forEach(e => { e.style.width = `${Math.max(0, Math.min(100, pct))}%`; e.style.background = color; });
        document.querySelectorAll(`[data-patient-fluid="${id}"]`).forEach(e => {
            e.style.height = `${Math.max(7, Math.min(82, pct * .75))}px`;
            e.style.background = Number(id) % 2 === 0 ? 'rgba(255,123,24,.55)' : 'rgba(26,193,224,.45)';
        });
        document.querySelectorAll(`[data-patient-status="${id}"]`).forEach(e => { e.textContent = statusLabel(status); setStatusClass(e, status); });

        const readings = p.readings || [];
        const labels = readings.length ? readings.map(r => r.label) : [p.last_update_time || clock(new Date())];
        const weights = readings.length ? readings.map(r => clampVolume(r.remaining_ml ?? r.weight_g)) : [remainingMl];
        const drops = readings.length ? readings.map(r => Number(r.drops_per_min || 0)) : [Number(p.current_drop_rate || 0)];
        createLine(`dashWeightChart${id}`, labels, weights, patientColor(id), t('weightMl', 'Volume (ml)'), 100, IV_CAPACITY_ML);
        createLine(`monitorWeightChart${id}`, labels, weights, patientColor(id), t('weightMl', 'Volume (ml)'), 100, IV_CAPACITY_ML);
        createLine(`monitorDropChart${id}`, labels, drops, patientColor(id), t('dropsPerMin', 'Drops/min'), 40);
        renderLiveLog(id, readings);
        handleQuarterNotification(id, quarter, name, remainingMl, status);
    }

    function renderLiveLog(id, readings) {
        const body = document.getElementById(`liveLog${id}`);
        if (!body) return;
        const rows = (readings || []).slice(-5).reverse();
        body.innerHTML = rows.map(r => `<tr><td>${r.label || '-'}</td><td>${Math.round(clampVolume(r.remaining_ml ?? r.weight_g))}</td><td>${Math.round(Number(r.drops_per_min || 0))}</td><td>${Math.round(Number(r.flow_rate_ml_hr || 0))}</td><td>${Math.round(Number(r.level_percent || 0))}</td><td>${r.quarter_label || quarterText(quarterFromVolume(r.remaining_ml ?? r.weight_g))}</td></tr>`).join('') || `<tr><td colspan="6">${t('noAlerts', 'No data')}</td></tr>`;
    }

    function alertTitle(a) {
        const name = displayPatientName(a.patient_name, a.patient_id) || `${t('patient', 'Patient')} ${a.patient_id || ''}`;
        const s = normStatus(a.alert_type);
        return `${name} – ${statusLabel(s)}`;
    }

    function alertDesc(a) {
        const s = normStatus(a.alert_type);
        if (s === 'Critical') return t('criticalMessage', 'IV level is critical. Immediate action required.');
        if (s === 'Low') return t('lowMessage', 'IV level is low. Please monitor.');
        return t('stableMessage', 'All monitored IV bags are within safe range.');
    }

    function alertIcon(status) {
        if (status === 'Critical') return 'bi-exclamation-triangle-fill';
        if (status === 'Low') return 'bi-clock';
        return 'bi-check-circle';
    }

    function alertClass(status) {
        if (status === 'Critical') return 'danger';
        if (status === 'Low') return 'warning';
        return 'success';
    }

    function alertItemHTML(a, index, full) {
        const s = normStatus(a.alert_type);
        const ack = a.acknowledged ? `<span class="ack-pill">${t('acknowledged', 'Acknowledged')}</span>` : '';
        const item = `<button type="button" class="notification-item ${alertClass(s)}" data-alert-index="${index}"><i class="bi ${alertIcon(s)}"></i><div><span>${a.created_at_full || a.created_at || ''}</span><strong>${alertTitle(a)}</strong><small>${a.message || alertDesc(a)}</small><em>${alertDesc(a)}</em>${ack}</div><i class="bi bi-chevron-right"></i></button>`;
        if (!full) return item;
        const form = (!a.acknowledged && a.id) ? `<form method="post" action="/acknowledge-alert/${a.id}"><button type="submit"><i class="bi bi-check2-circle"></i> ${t('acknowledge', 'Acknowledge')}</button></form>` : '';
        return `<div class="alert-row-wrap">${item}${form}</div>`;
    }

    function renderAlertDetail(alert) {
        const box = document.getElementById('alertDetailCard');
        if (!box) return;
        if (!alert) {
            box.innerHTML = `<h3>${t('notificationDetails', 'Notification Details')}</h3><div class="empty-detail-state"><i class="bi bi-bell"></i><p>${t('selectAlertPrompt', 'Click a notification on the left to view details.')}</p></div>`;
            return;
        }
        const s = normStatus(alert.alert_type);
        box.innerHTML = `
            <h3>${t('notificationDetails', 'Notification Details')}</h3>
            <div class="detail-row"><span>${t('patient', 'Patient')}</span><strong>${displayPatientName(alert.patient_name, alert.patient_id)}</strong></div>
            <div class="detail-row"><span>${t('alertType', 'Alert Type')}</span><strong>${statusLabel(s)}</strong></div>
            <div class="detail-row"><span>${t('ivLevel', 'IV Level')}</span><strong>${Math.round(Number(alert.level_percent || 0))}%</strong></div>
            <div class="detail-row"><span>${t('alertTime', 'Alert Time')}</span><strong>${alert.created_at_full || alert.created_at || '-'}</strong></div>
            <div class="detail-row full"><span>${t('message', 'Message')}</span><p>${alert.message || alertDesc(alert)}</p></div>
        `;
    }

    function renderNotifications(data) {
        const alerts = data.alerts || [];
        ['alertCount', 'sideAlertBadge', 'mobileAlertBadge', 'reportAlertCount'].forEach(id => { const e = document.getElementById(id); if (e) e.textContent = alerts.length; });
        const compact = alerts.length ? alerts.slice(0, 3).map((a, i) => alertItemHTML(a, i, false)).join('') : `<button type="button" class="notification-item success"><i class="bi bi-check-circle"></i><div><span>${data.server_time || ''}</span><strong>${t('systemStable', 'System Stable')}</strong><small>${t('stableMessage', 'All monitored IV bags are within safe range.')}</small></div><i class="bi bi-chevron-right"></i></button>`;
        const full = alerts.length ? alerts.map((a, i) => alertItemHTML(a, i, true)).join('') : `<button type="button" class="notification-item success"><i class="bi bi-check-circle"></i><div><span>${data.server_time || ''}</span><strong>${t('systemStable', 'System Stable')}</strong><small>${t('stableMessage', 'All monitored IV bags are within safe range.')}</small></div><i class="bi bi-chevron-right"></i></button>`;
        const n = document.getElementById('notificationList');
        if (n) n.innerHTML = compact;
        const a = document.getElementById('alertPageList');
        if (a) a.innerHTML = full;
        window.__ALERTS__ = alerts;
        if (Number.isInteger(window.__ACTIVE_ALERT_INDEX__) && alerts[window.__ACTIVE_ALERT_INDEX__]) {
            renderAlertDetail(alerts[window.__ACTIVE_ALERT_INDEX__]);
            document.querySelectorAll('[data-alert-index]').forEach(el => el.classList.toggle('active', Number(el.dataset.alertIndex) === window.__ACTIVE_ALERT_INDEX__));
        } else {
            renderAlertDetail(null);
        }
    }

    function updateSystem(data) {
        const src = (data.system && data.system.data_source) || 'PostgreSQL / Render Cloud';
        ['dataSource', 'settingsDataSource'].forEach(id => { const e = document.getElementById(id); if (e) e.textContent = src; });
    }

    function updateDashboard(data) {
        if (!data || !Array.isArray(data.patients)) return;
        window.__LAST_DASHBOARD_DATA__ = data;
        translateStatic();
        data.patients.forEach(p => {
            try { updatePatient(p); } catch (err) { console.error('Patient update failed', p && p.id, err); }
        });
        try { createDropComparison(data); } catch (err) { console.error('Drop comparison failed', err); }
        try { createQuarterAnalysis(data); } catch (err) { console.error('Quarter analysis failed', err); }
        try { renderNotifications(data); } catch (err) { console.error('Notifications failed', err); }
        try { updateSystem(data); } catch (err) { console.error('System update failed', err); }
    }

    async function refresh(showToast) {
        if (!document.getElementById('dashboardRoot')) return;
        try {
            const r = await fetch('/api/dashboard-data', { cache: 'no-store' });
            if (!r.ok) return;
            const data = await r.json();
            updateDashboard(data);
            if (showToast) toast(t('refreshDone', 'Dashboard data refreshed.'));
        } catch (e) { console.error('Dashboard refresh failed', e); }
    }

    function resizeCharts() {
        setTimeout(() => Object.values(charts).forEach(c => { if (c) { c.resize(); c.update('none'); } }), 80);
    }

    function showSection(name) {
        const target = name || 'dashboard';
        document.querySelectorAll('.app-section').forEach(s => s.classList.toggle('active', s.dataset.section === target));
        document.querySelectorAll('[data-section-target]').forEach(b => b.classList.toggle('active', b.dataset.sectionTarget === target));
        resizeCharts();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function setupSections() {
        document.querySelectorAll('[data-section-target]').forEach(b => {
            b.addEventListener('click', e => {
                const target = b.dataset.sectionTarget;
                if (target) { e.preventDefault(); showSection(target); }
            });
        });
    }

    function setupPatientFilter() {
        document.querySelectorAll('[data-patient-filter]').forEach(btn => {
            btn.addEventListener('click', () => {
                const value = btn.dataset.patientFilter;
                document.querySelectorAll('[data-patient-filter]').forEach(b => b.classList.toggle('active', b === btn));
                document.querySelectorAll('[data-monitor-patient-panel]').forEach(panel => {
                    panel.style.display = (value === 'all' || panel.dataset.monitorPatientPanel === value) ? '' : 'none';
                });
                resizeCharts();
            });
        });
    }

    function setupAlertClicks() {
        document.addEventListener('click', e => {
            const item = e.target.closest('[data-alert-index]');
            if (!item) return;
            if (e.target.closest('form')) return;
            const idx = Number(item.dataset.alertIndex || 0);
            window.__ACTIVE_ALERT_INDEX__ = idx;
            document.querySelectorAll('[data-alert-index]').forEach(el => el.classList.toggle('active', Number(el.dataset.alertIndex) === idx));
            if (window.__ALERTS__) renderAlertDetail(window.__ALERTS__[idx]);
            if (item.closest('#notificationList')) showSection('alerts');
        });
    }

    function savePreferences() {
        const states = Array.from(document.querySelectorAll('[data-toggle-pref]')).map(btn => btn.querySelector('.toggle') && btn.querySelector('.toggle').classList.contains('on'));
        localStorage.setItem('ivNotificationPreferences', JSON.stringify(states));
    }

    function loadPreferences() {
        try {
            const states = JSON.parse(localStorage.getItem('ivNotificationPreferences') || 'null');
            if (!Array.isArray(states)) return;
            document.querySelectorAll('[data-toggle-pref]').forEach((btn, i) => {
                const toggle = btn.querySelector('.toggle');
                if (toggle) toggle.classList.toggle('on', Boolean(states[i]));
            });
        } catch (e) { console.warn('Preference load failed', e); }
    }

    function userRowHTML(user) {
        const initial = (user.name || 'U').trim().charAt(0).toUpperCase();
        const roleKey = String(user.role || 'Staff').toLowerCase() === 'administrator' ? 'administrator' : String(user.role || 'Staff').toLowerCase() === 'viewer' ? 'viewer' : 'staff';
        return `<tr data-added-user><td><b>${initial}</b><span><strong>${user.name}</strong><small>${user.email}</small></span></td><td><em>${t(roleKey, user.role || 'Staff')}</em></td><td><button type="button" data-demo-button>${t('manage', 'Manage')}</button></td></tr>`;
    }

    function loadUsers() {
        const body = document.getElementById('userTableBody');
        if (!body) return;
        body.querySelectorAll('[data-added-user]').forEach(row => row.remove());
        try {
            const users = JSON.parse(localStorage.getItem('ivAddedUsers') || '[]');
            users.forEach(user => body.insertAdjacentHTML('beforeend', userRowHTML(user)));
        } catch (e) { console.warn('User load failed', e); }
    }

    function setupAddUser() {
        const form = document.getElementById('addUserForm');
        document.querySelectorAll('[data-action="open-add-user"]').forEach(btn => btn.addEventListener('click', () => {
            if (!form) return;
            form.hidden = !form.hidden;
            if (!form.hidden) form.querySelector('input[name="name"]')?.focus();
        }));
        if (!form) return;
        form.addEventListener('submit', e => {
            e.preventDefault();
            const user = {
                name: form.elements.name.value.trim(),
                email: form.elements.email.value.trim(),
                role: form.elements.role.value
            };
            if (!user.name || !user.email) return;
            const users = JSON.parse(localStorage.getItem('ivAddedUsers') || '[]');
            users.push(user);
            localStorage.setItem('ivAddedUsers', JSON.stringify(users));
            form.reset();
            form.hidden = true;
            loadUsers();
            toast(t('userAdded', 'User added to this screen.'));
        });
    }

    function excelFilenameFromResponse(response) {
        const cd = response.headers.get('Content-Disposition') || response.headers.get('content-disposition') || '';
        const utf = cd.match(/filename\*=UTF-8''([^;]+)/i);
        if (utf) return decodeURIComponent(utf[1].replace(/['"]/g, ''));
        const plain = cd.match(/filename="?([^";]+)"?/i);
        if (plain) return plain[1];
        const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
        return `iv_monitoring_data_${stamp}.xlsx`;
    }

    async function downloadExcel(event, link) {
        if (event) event.preventDefault();
        const href = link && link.getAttribute('href') ? link.getAttribute('href') : '/export/excel';
        toast(t('preparingExcel', 'Preparing Excel report...'));
        try {
            const response = await fetch(href, { method: 'GET', cache: 'no-store', credentials: 'same-origin' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const blob = await response.blob();
            if (!blob || blob.size < 100) throw new Error('Empty Excel file');
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = excelFilenameFromResponse(response);
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1200);
            toast(t('excelDownloaded', 'Excel report downloaded.'));
        } catch (err) {
            console.error('Excel download failed', err);
            toast(t('excelFailed', 'Excel download failed. Try Refresh, then click Export Excel again.'));
            setTimeout(() => { window.location.href = href; }, 450);
        }
    }

    function setupButtons() {
        document.querySelectorAll('[data-action="refresh-dashboard"]').forEach(btn => btn.addEventListener('click', () => refresh(true)));
        document.querySelectorAll('[data-action="download-excel"]').forEach(link => link.addEventListener('click', e => downloadExcel(e, link)));
        document.querySelectorAll('[data-action="stop-empty-alarm"]').forEach(btn => btn.addEventListener('click', () => stopAlarmForPatient(btn.dataset.patientId)));
        document.querySelectorAll('[data-action="save-settings"]').forEach(btn => btn.addEventListener('click', () => { savePreferences(); toast(t('preferencesSavedBrowser', 'Notification preferences saved on this browser.')); }));
        document.querySelectorAll('[data-action="reset-settings"]').forEach(btn => btn.addEventListener('click', () => { localStorage.removeItem('ivNotificationPreferences'); document.querySelectorAll('[data-toggle-pref] .toggle').forEach((t,i) => t.classList.toggle('on', i !== 3)); toast(t('resetDone', 'Settings restored on this screen.')); }));
        document.querySelectorAll('[data-demo-button]').forEach(btn => btn.addEventListener('click', () => toast(t('demoButtonNote', 'This button is active for dashboard demonstration.'))));
        document.querySelectorAll('[data-toggle-pref]').forEach(btn => btn.addEventListener('click', () => {
            const toggle = btn.querySelector('.toggle');
            if (toggle) toggle.classList.toggle('on');
            savePreferences();
            toast(t('toggleUpdated', 'Preference updated.'));
        }));
        setupAddUser();
    }

    function toast(message) {
        const box = document.getElementById('toastMessage');
        if (!box) return;
        box.textContent = message;
        box.classList.add('show');
        clearTimeout(window.__toastTimer);
        window.__toastTimer = setTimeout(() => box.classList.remove('show'), 2200);
    }

    window.addEventListener('load', () => setTimeout(resizeCharts, 250));
    document.addEventListener('DOMContentLoaded', () => {
        translateStatic();
        updateClock();
        setInterval(updateClock, 1000);
        setupSections();
        setupPatientFilter();
        setupAlertClicks();
        loadPreferences();
        loadUsers();
        setupButtons();
        ['pointerdown', 'click', 'touchstart', 'keydown'].forEach(evt => document.addEventListener(evt, unlockAudioAndPreview, { once: true }));
        if (window.INITIAL_DASHBOARD_DATA) {
            updateDashboard(window.INITIAL_DASHBOARD_DATA);
            setInterval(() => refresh(false), 2000);
        }
    });
})();
