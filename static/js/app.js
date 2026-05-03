(function () {
    const chartRefs = {};
    const weightChartPrefix = 'weightChart';
    const statusClassMap = {
        Normal: 'status-normal',
        Low: 'status-low',
        Critical: 'status-critical'
    };

    function getCurrentLang() {
        return document.body.dataset.initialLanguage || 'en';
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
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (dict[key]) el.setAttribute('placeholder', dict[key]);
        });
    }

    function pad(value) { return String(value).padStart(2, '0'); }

    function formatClock(date) {
        let hours = date.getHours();
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;
        return `${pad(hours)}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${ampm}`;
    }

    function formatDate(date) {
        return date.toLocaleDateString(getCurrentLang() === 'ms' ? 'ms-MY' : 'en-MY', {
            day: '2-digit', month: 'long', year: 'numeric'
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
        if (s === 'critical' || s === 'kritikal') return 'Critical';
        if (s === 'low' || s === 'rendah') return 'Low';
        return 'Normal';
    }

    function statusLabel(raw) {
        const s = normaliseStatus(raw);
        const key = s.toLowerCase();
        return t(key, s);
    }

    function setText(selector, value) {
        document.querySelectorAll(selector).forEach(el => { el.textContent = value; });
    }

    function formatWeight(value) {
        const n = Math.max(0, Number(value || 0));
        return `${Math.round(n).toLocaleString()} g`;
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
            layout: { padding: { top: 10, right: 14, bottom: 8, left: 8 } },
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: true, position: 'top', labels: { usePointStyle: true, boxWidth: 7, color: '#0a285c', font: { weight: 700 } } },
                tooltip: { backgroundColor: '#08285a', padding: 12, cornerRadius: 12 }
            },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#52677f', maxRotation: 0, autoSkip: true, maxTicksLimit: 8, padding: 8 } },
                y: { beginAtZero: true, grid: { color: 'rgba(8, 40, 90, .08)' }, ticks: { color: '#52677f', padding: 8 }, title: { display: true, text: yTitle, color: '#52677f', font: { weight: 700 } } }
            }
        };
    }

    function niceMax(value, minimum = 100) {
        const n = Math.max(Number(value || 0), minimum);
        const step = n > 1000 ? 250 : n > 500 ? 100 : 50;
        return Math.ceil((n * 1.12) / step) * step;
    }

    function relabelCharts() {
        Object.values(chartRefs).forEach(chart => {
            if (!chart) return;
            chart.options.scales.y.title.text = chart.canvas && (chart.canvas.id === 'dropComparisonChart' || chart.canvas.id === 'monitorDropComparisonChart') ? t('dropsPerMin', 'Drops/min') : t('weight', 'Weight (g)');
            if (chart.data.datasets && chart.canvas && chart.canvas.id !== 'dropComparisonChart') {
                chart.data.datasets[0].label = t('weight', 'Weight (g)');
            }
            chart.resize();
            chart.update('none');
        });
    }

    function buildOrUpdateWeightChart(patient) {
        const canvas = document.getElementById(weightChartPrefix + patient.id);
        if (!canvas || !window.Chart) return;
        let labels = (patient.readings || []).map(r => r.label);
        let weights = (patient.readings || []).map(r => Math.max(0, Number(r.weight_g || 0)));
        if (!labels.length) {
            labels = [patient.last_update_time || formatClock(new Date())];
            weights = [Math.max(0, Number(patient.current_weight_g || 0))];
        }
        const ctx = canvas.getContext('2d');
        const teal = Number(patient.id) % 2 === 0 ? 'rgba(255,134,46,1)' : 'rgba(0,153,168,1)';
        const yMax = niceMax(Math.max(Number(patient.full_weight_g || 0), ...weights), 100);

        if (!chartRefs[canvas.id]) {
            chartRefs[canvas.id] = new Chart(canvas, {
                type: 'line',
                data: {
                    labels,
                    datasets: [{
                        label: t('weight', 'Weight (g)'),
                        data: weights,
                        borderColor: teal,
                        backgroundColor: createGradient(ctx, teal),
                        borderWidth: 3,
                        pointRadius: 2.5,
                        pointHoverRadius: 5,
                        pointHitRadius: 8,
                        tension: .35,
                        fill: true
                    }]
                },
                options: chartBaseOptions(t('weight', 'Weight (g)'))
            });
            chartRefs[canvas.id].options.scales.y.suggestedMax = yMax;
        } else {
            const chart = chartRefs[canvas.id];
            chart.data.labels = labels;
            chart.data.datasets[0].label = t('weight', 'Weight (g)');
            chart.data.datasets[0].data = weights;
            chart.options.scales.y.suggestedMax = yMax;
            chart.update();
        }
    }

    function buildOrUpdateDropChart(data) {
        const labels = (data.drop_comparison && data.drop_comparison.labels) || [];
        const series = (data.drop_comparison && data.drop_comparison.series) || [];
        const colors = ['rgba(0,153,168,1)', 'rgba(255,134,46,1)'];
        const allDrops = series.flatMap(item => (item.drops || []).map(v => Math.max(0, Number(v || 0))));
        const yMax = niceMax(Math.max(...allDrops, 0), 50);
        const datasets = series.map((item, index) => ({
            label: item.patient_name || `${t('patient', 'Patient')} ${index + 1}`,
            data: (item.drops || []).map(v => Math.max(0, Number(v || 0))),
            borderColor: colors[index % colors.length],
            backgroundColor: colors[index % colors.length].replace('1)', '.08)'),
            borderWidth: 3,
            pointRadius: 2.5,
            pointHoverRadius: 5,
            tension: .32,
            fill: false
        }));

        ['dropComparisonChart', 'monitorDropComparisonChart'].forEach(id => {
            const canvas = document.getElementById(id);
            if (!canvas || !window.Chart) return;
            if (!chartRefs[id]) {
                chartRefs[id] = new Chart(canvas, {
                    type: 'line',
                    data: { labels, datasets },
                    options: chartBaseOptions(t('dropsPerMin', 'Drops/min'))
                });
                chartRefs[id].options.scales.y.suggestedMax = yMax;
            } else {
                const chart = chartRefs[id];
                chart.data.labels = labels;
                chart.data.datasets = datasets;
                chart.options.scales.y.title.text = t('dropsPerMin', 'Drops/min');
                chart.options.scales.y.suggestedMax = yMax;
                chart.update();
            }
        });
    }

    function updatePatientCard(patient) {
        const status = normaliseStatus(patient.current_status);
        const percent = Math.round(Number(patient.current_level_percent || 0));
        const progressEls = document.querySelectorAll(`[data-patient-progress="${patient.id}"]`);
        const levelEls = document.querySelectorAll(`[data-patient-level="${patient.id}"]`);
        const statusEls = document.querySelectorAll(`[data-patient-status="${patient.id}"]`);

        setText(`[data-patient-name="${patient.id}"]`, patient.patient_name);
        setText(`[data-patient-chart-name="${patient.id}"]`, patient.patient_name);
        setText(`[data-patient-code="${patient.id}"]`, patient.patient_code);
        setText(`[data-patient-ward="${patient.id}"]`, patient.ward_number);
        setText(`[data-patient-bed="${patient.id}"]`, patient.bed_number);
        setText(`[data-patient-weight="${patient.id}"]`, formatWeight(patient.remaining_weight_g));
        setText(`[data-patient-current-weight="${patient.id}"]`, formatWeight(patient.current_weight_g));
        setText(`[data-patient-remaining-weight="${patient.id}"]`, formatWeight(patient.remaining_weight_g));
        setText(`[data-patient-full-weight="${patient.id}"]`, formatWeight(patient.full_weight_g));
        setText(`[data-patient-empty-weight="${patient.id}"]`, formatWeight(patient.empty_weight_g));
        setText(`[data-patient-drop="${patient.id}"]`, Number(patient.current_drop_rate || 0).toFixed(0));
        setText(`[data-patient-flow="${patient.id}"]`, Number(patient.current_flow_rate_ml_hr || 0).toFixed(0));
        setText(`[data-patient-updated="${patient.id}"]`, patient.last_update_full || patient.last_update_time || '--:--:--');

        levelEls.forEach(level => {
            level.textContent = `${percent}%`;
            level.classList.remove('status-text-normal', 'status-text-low', 'status-text-critical');
            level.classList.add(`status-text-${status.toLowerCase()}`);
        });
        progressEls.forEach(progress => {
            progress.style.width = `${Math.max(0, Math.min(100, percent))}%`;
            progress.style.background = status === 'Critical' ? cssVar('--red', '#f2414a') : status === 'Low' ? cssVar('--orange', '#ff862e') : cssVar('--teal', '#0099a8');
        });
        statusEls.forEach(statusEl => {
            statusEl.textContent = statusLabel(status);
            statusEl.className = `status-pill ${statusClassMap[status]}`;
        });
    }

    function alertTitle(alert) {
        const patientName = alert.patient_name || `${t('patient', 'Patient')} ${alert.patient_id || ''}`;
        const type = normaliseStatus(alert.alert_type);
        if (type === 'Critical') return `${patientName} – ${t('critical', 'Critical')}`;
        if (type === 'Low') return `${patientName} – ${t('low', 'Low')}`;
        return `${patientName} – ${t('stable', 'Stable')}`;
    }

    function alertDescription(alert) {
        const type = normaliseStatus(alert.alert_type);
        if (type === 'Critical') return t('criticalMessage', 'IV level is critical. Immediate action required.');
        if (type === 'Low') return t('lowMessage', 'IV level is low. Please monitor.');
        return t('stableMessage', 'All monitored IV bags are within safe range.');
    }

    function updateNotifications(data) {
        const list = document.getElementById('notificationList');
        const alertCount = document.getElementById('alertCount');
        const alertBadge = document.getElementById('alertBadge');
        const mobileBadge = document.getElementById('mobileAlertBadge');
        const reportAlertCount = document.getElementById('reportAlertCount');
        const alerts = data.alerts || [];
        [alertCount, alertBadge, mobileBadge, reportAlertCount].forEach(el => { if (el) el.textContent = alerts.length; });
        if (!list) return;

        if (!alerts.length) {
            list.innerHTML = `
                <div class="notification-item success">
                    <i class="bi bi-check-circle-fill"></i>
                    <div><span>${data.server_time || ''}</span><strong>${t('systemStable', 'System Stable')}</strong><small>${t('stableMessage', 'All monitored IV bags are within safe range.')}</small></div>
                </div>`;
            return;
        }

        list.innerHTML = alerts.map(alert => {
            const type = normaliseStatus(alert.alert_type);
            const danger = type === 'Critical';
            const icon = danger ? 'bi-exclamation-triangle-fill' : 'bi-exclamation-circle-fill';
            const typeClass = danger ? 'danger' : 'warning';
            return `
                <div class="notification-item ${typeClass}">
                    <i class="bi ${icon}"></i>
                    <div>
                        <span>${alert.created_at}</span>
                        <strong>${alertTitle(alert)}</strong>
                        <small>${alertDescription(alert)}</small>
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

    function resizeChartsSoon() {
        window.setTimeout(() => {
            Object.values(chartRefs).forEach(chart => {
                if (chart) {
                    chart.resize();
                    chart.update('none');
                }
            });
        }, 80);
    }

    function showSection(name) {
        const sectionName = name || 'dashboard';
        document.querySelectorAll('.dashboard-section').forEach(section => {
            section.classList.toggle('active', section.dataset.section === sectionName);
        });
        document.querySelectorAll('[data-section-target]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.sectionTarget === sectionName);
        });
        resizeChartsSoon();
    }

    function setupDashboardSections() {
        if (!document.getElementById('dashboardRoot')) return;
        document.querySelectorAll('[data-section-target]').forEach(btn => {
            btn.addEventListener('click', () => showSection(btn.dataset.sectionTarget));
        });
        showSection('dashboard');
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
        setupDashboardSections();

        if (window.INITIAL_DASHBOARD_DATA) {
            updateDashboard(window.INITIAL_DASHBOARD_DATA);
            relabelCharts();
            setInterval(refreshDashboardData, 5000);
        }
    });
})();
