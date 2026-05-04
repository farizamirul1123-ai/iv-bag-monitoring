(function () {
    const chartRefs = {};
    const weightChartPrefix = 'weightChart';
    const statusClassMap = {
        Normal: 'status-normal',
        Low: 'status-low',
        Critical: 'status-critical'
    };

    function getCurrentLang() {
        return document.body.dataset.initialLanguage || localStorage.getItem('appLang') || 'en';
    }

    function t(key, fallback = '') {
        const lang = getCurrentLang();
        const dict = (window.TRANSLATIONS && TRANSLATIONS[lang]) || (window.TRANSLATIONS && TRANSLATIONS.en) || {};
        return dict[key] || fallback || key;
    }

    function setLanguageVisual(lang) {
        const dict = (window.TRANSLATIONS && TRANSLATIONS[lang]) || (window.TRANSLATIONS && TRANSLATIONS.en) || {};
        document.documentElement.lang = lang;
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (dict[key]) el.textContent = dict[key];
        });
        localStorage.setItem('appLang', lang);
    }

    function pad(value) {
        return String(value).padStart(2, '0');
    }

    function formatClock(date) {
        let hours = date.getHours();
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;
        return `${pad(hours)}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${ampm}`;
    }

    function formatDate(date) {
        return date.toLocaleDateString('en-MY', {
            day: '2-digit',
            month: 'long',
            year: 'numeric'
        });
    }

    function updateClocks() {
        const now = new Date();
        const localClock = document.getElementById('localClock');
        const localDate = document.getElementById('localDate');
        if (localClock) localClock.textContent = formatClock(now);
        if (localDate) localDate.textContent = formatDate(now);
    }

    function normaliseStatus(raw) {
        if (!raw) return 'Normal';
        const s = String(raw).toLowerCase();
        if (s === 'critical') return 'Critical';
        if (s === 'low') return 'Low';
        return 'Normal';
    }

    function statusLabel(raw) {
        const s = normaliseStatus(raw);
        const key = s.toLowerCase();
        return t(key, s);
    }

    function setText(selector, value) {
        const el = document.querySelector(selector);
        if (el) el.textContent = value;
    }

    function cssVar(name, fallback) {
        return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
    }

    function createGradient(ctx, color) {
        const gradient = ctx.createLinearGradient(0, 0, 0, 210);
        gradient.addColorStop(0, color.replace('1)', '.22)'));
        gradient.addColorStop(1, color.replace('1)', '0)'));
        return gradient;
    }

    function chartBaseOptions(yTitle) {
        return {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 450 },
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: true, labels: { usePointStyle: true, boxWidth: 7, color: '#0a285c', font: { weight: 700 } } },
                tooltip: { backgroundColor: '#08285a', padding: 12, cornerRadius: 12 }
            },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#52677f', maxRotation: 0, autoSkip: true, maxTicksLimit: 7 } },
                y: { beginAtZero: true, grid: { color: 'rgba(8, 40, 90, .08)' }, ticks: { color: '#52677f' }, title: { display: true, text: yTitle, color: '#52677f' } }
            }
        };
    }

    function buildOrUpdateWeightChart(patient) {
        const canvas = document.getElementById(weightChartPrefix + patient.id);
        if (!canvas || !window.Chart) return;
        const labels = patient.readings.map(r => r.label);
        const weights = patient.readings.map(r => r.weight_g);
        const ctx = canvas.getContext('2d');
        const teal = 'rgba(0,153,168,1)';

        if (!chartRefs[canvas.id]) {
            chartRefs[canvas.id] = new Chart(canvas, {
                type: 'line',
                data: {
                    labels,
                    datasets: [{
                        label: 'Weight (g)',
                        data: weights,
                        borderColor: teal,
                        backgroundColor: createGradient(ctx, teal),
                        borderWidth: 3,
                        pointRadius: 2,
                        pointHoverRadius: 5,
                        pointHitRadius: 8,
                        tension: .35,
                        fill: true
                    }]
                },
                options: chartBaseOptions('Weight (g)')
            });
        } else {
            const chart = chartRefs[canvas.id];
            chart.data.labels = labels;
            chart.data.datasets[0].data = weights;
            chart.update();
        }
    }

    function buildOrUpdateDropChart(data) {
        const canvas = document.getElementById('dropComparisonChart');
        if (!canvas || !window.Chart) return;
        const labels = data.drop_comparison.labels || [];
        const series = data.drop_comparison.series || [];
        const colors = ['rgba(0,153,168,1)', 'rgba(255,134,46,1)'];
        const datasets = series.map((item, index) => ({
            label: item.patient_name || `Patient ${index + 1}`,
            data: item.drops || [],
            borderColor: colors[index % colors.length],
            backgroundColor: colors[index % colors.length].replace('1)', '.08)'),
            borderWidth: 3,
            pointRadius: 2.5,
            pointHoverRadius: 5,
            tension: .32,
            fill: false
        }));

        if (!chartRefs.dropComparisonChart) {
            chartRefs.dropComparisonChart = new Chart(canvas, {
                type: 'line',
                data: { labels, datasets },
                options: chartBaseOptions('drops/min')
            });
        } else {
            const chart = chartRefs.dropComparisonChart;
            chart.data.labels = labels;
            chart.data.datasets = datasets;
            chart.update();
        }
    }

    function updatePatientCard(patient) {
        const status = normaliseStatus(patient.current_status);
        const percent = Math.round(Number(patient.current_level_percent || 0));
        const progress = document.querySelector(`[data-patient-progress="${patient.id}"]`);
        const level = document.querySelector(`[data-patient-level="${patient.id}"]`);
        const statusEl = document.querySelector(`[data-patient-status="${patient.id}"]`);

        setText(`[data-patient-name="${patient.id}"]`, patient.patient_name);
        setText(`[data-patient-code="${patient.id}"]`, patient.patient_code);
        setText(`[data-patient-ward="${patient.id}"]`, patient.ward_number);
        setText(`[data-patient-bed="${patient.id}"]`, patient.bed_number);
        setText(`[data-patient-weight="${patient.id}"]`, `${Math.round(Number(patient.current_weight_g || 0))} g`);
        setText(`[data-patient-drop="${patient.id}"]`, Number(patient.current_drop_rate || 0).toFixed(0));
        setText(`[data-patient-flow="${patient.id}"]`, Number(patient.current_flow_rate_ml_hr || 0).toFixed(0));
        setText(`[data-patient-updated="${patient.id}"]`, patient.last_update_time || '--:--:--');

        if (level) {
            level.textContent = `${percent}%`;
            level.classList.remove('status-text-normal', 'status-text-low', 'status-text-critical');
            level.classList.add(`status-text-${status.toLowerCase()}`);
        }
        if (progress) {
            progress.style.width = `${Math.max(0, Math.min(100, percent))}%`;
            progress.style.background = status === 'Critical' ? cssVar('--red', '#f2414a') : status === 'Low' ? cssVar('--orange', '#ff862e') : cssVar('--teal', '#0099a8');
        }
        if (statusEl) {
            statusEl.textContent = statusLabel(status);
            statusEl.className = `status-pill ${statusClassMap[status]}`;
        }
    }

    function updateNotifications(data) {
        const list = document.getElementById('notificationList');
        const alertCount = document.getElementById('alertCount');
        const alertBadge = document.getElementById('alertBadge');
        const mobileBadge = document.getElementById('mobileAlertBadge');
        const alerts = data.alerts || [];
        [alertCount, alertBadge, mobileBadge].forEach(el => { if (el) el.textContent = alerts.length; });
        if (!list) return;

        if (!alerts.length) {
            list.innerHTML = `
                <div class="notification-item success">
                    <i class="bi bi-check-circle-fill"></i>
                    <div><span>${data.server_time || ''}</span><strong>Patient A – Stable</strong><small>IV level is normal. Tahap IV adalah normal.</small></div>
                </div>`;
            return;
        }

        list.innerHTML = alerts.map(alert => {
            const danger = alert.alert_type === 'Critical';
            const icon = danger ? 'bi-exclamation-triangle-fill' : 'bi-exclamation-circle-fill';
            const typeClass = danger ? 'danger' : 'warning';
            return `
                <div class="notification-item ${typeClass}">
                    <i class="bi ${icon}"></i>
                    <div>
                        <span>${alert.created_at}</span>
                        <strong>${alert.message}</strong>
                        <small>${alert.alert_type}</small>
                    </div>
                </div>`;
        }).join('');
    }

    function updateSystemInfo(data) {
        const source = document.getElementById('dataSource');
        if (source && data.system) source.textContent = data.system.data_source || 'PostgreSQL / Render';
    }

    function updateDashboard(data) {
        if (!data || !Array.isArray(data.patients)) return;
        data.patients.forEach(patient => {
            updatePatientCard(patient);
            buildOrUpdateWeightChart(patient);
        });
        buildOrUpdateDropChart(data);
        updateNotifications(data);
        updateSystemInfo(data);
    }

    async function refreshDashboardData() {
        if (!document.getElementById('dashboardRoot')) return;
        try {
            const response = await fetch('/api/dashboard-data', { cache: 'no-store' });
            if (!response.ok) return;
            const data = await response.json();
            updateDashboard(data);
        } catch (error) {
            console.error('Dashboard refresh failed:', error);
        }
    }

    function setupMonitorSelection() {
        const form = document.querySelector('.monitor-card-grid');
        if (!form) return;
        form.querySelectorAll('.monitor-select-card').forEach(card => {
            card.addEventListener('click', () => {
                const input = card.querySelector('input[type="radio"]');
                if (input) input.checked = true;
                window.setTimeout(() => form.submit(), 120);
            });
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        setLanguageVisual(getCurrentLang());
        updateClocks();
        setInterval(updateClocks, 1000);
        setupMonitorSelection();

        if (window.INITIAL_DASHBOARD_DATA) {
            updateDashboard(window.INITIAL_DASHBOARD_DATA);
            // Faster refresh so the graph visibly updates when ESP32 sends new data.
            setInterval(refreshDashboardData, 2000);
        }
    });
})();
