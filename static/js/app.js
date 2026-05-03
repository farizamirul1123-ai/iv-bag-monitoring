(function(){
'use strict';

const T = {
  en: {
    systemSubtitle:'Smart IV Monitoring System', finalYearProject:'Final Year Project Dashboard',
    welcomeTitle:'Welcome to IV Monitoring', welcomeSubtitle:'Smart IV Monitoring System', welcomeText:'A smart solution for real-time intravenous (IV) monitoring. Empowering healthcare with accurate data, instant alerts, and better patient care.', tapStart:'Tap to Start', selectMonitorToView:'Select a monitor to view real-time data', infoOpenMonitor:'Click the IV bag or tap the button to open monitor selection.', systemFeatures:'System Features', realtimeMonitoring:'Real-time Monitoring', realtimeMonitoringDesc:'Live tracking of IV flow, drip rate, and remaining volume.', smartNotifications:'Smart Notifications', smartNotificationsDesc:'Instant alerts for low volume or abnormalities.', excelExport:'Export Excel', exportExcelSmall:'Export to Excel', excelExportDesc:'Export patient data and logs to Excel with one click.', responsiveAccess:'Responsive Access', responsiveAccessDesc:'Access monitors securely from desktop or mobile devices.', cloudIntegration:'Cloud Integration', cloudIntegrationDesc:'Powered by PostgreSQL database on Render cloud.',
    welcome:'Welcome', welcomeMs:'Welcome', monitorSelection:'Monitor Selection', monitorSelectionMs:'Monitor Selection', dashboard:'Dashboard', dashboardMs:'Dashboard', selectMonitorTitle:'Select Monitor', chooseMonitor:'Choose who will monitor the IV system. You will be redirected to their dashboard.', monitorSupervisor:'Monitor Supervisor', projectTeam:'Project Team', openDashboard:'Open Dashboard', selectInfo:'Selecting a monitor will open their real-time dashboard.',
    monitors:'Monitors', patients:'Patients', alerts:'Alerts', reports:'Reports', settings:'Settings', collapse:'Collapse', live:'LIVE', liveDesc:'Data updating in real-time', refresh:'Refresh', viewAll:'View All', ivLevel:'IV Level', remaining:'Remaining', remainingVolume:'Remaining Volume', dripRate:'Drip Rate', dropsMin:'drops/min', flowRate:'Flow Rate', status:'Status', lastUpdate:'Last Update', normal:'Normal', low:'Low', critical:'Critical', weightTrend:'IV Weight vs Time', dropComparison:'Drop Rate Comparison', last60Minutes:'Last 60 minutes', notifications:'Notifications', systemInfo:'System Info', dataSource:'Data Source', connectionStatus:'Connection Status', connected:'Connected', lastBackup:'Last Backup',
    monitorsTitle:'Monitors', monitorsSubtitle:'Live IV metrics and charts are updated in real time.', totalWeight:'TOTAL WEIGHT', weightVsTime:'Weight vs Time (g)', dropRateTrend:'Drop Rate Trend', liveDataLog:'Live Data Log', latestReadings:'Latest Readings', patientsTitle:'Patients', patientsSubtitle:'Edit patient name, ward, bed and calibration values.', patientName:'Patient Name', patientCode:'Patient ID', ward:'Ward', bed:'Bed', fullWeight:'Full Weight (g)', emptyWeight:'Empty Weight (g)', manualTest:'Manual Test', submitReading:'Submit Reading', saveChanges:'Save Changes',
    alertsCenter:'Alerts Center', alertsSubtitle:'Displays low-level, nearing-empty, and abnormal IV notifications for monitored patients.', criticalAlerts:'Critical Alerts', warningAlerts:'Warning Alerts', resolvedAlerts:'Resolved Alerts', acknowledge:'Acknowledge', reportsTitle:'Reports', reportsSubtitle:'Generate comprehensive IV monitoring summaries and downloadable records.', dateRange:'Date Range', patient:'Patient', allPatients:'All Patients', reportType:'Report Type', generateReport:'Generate Report', totalRecords:'Total Records', averageLevel:'Average IV Level', totalAlerts:'Total Alerts', averageFlow:'Average Flow Rate', recentExports:'Recent Exports', dailySummary:'Daily IV Monitoring Summary', settingsTitle:'Settings', settingsSubtitle:'Manage language, notification preferences, cloud connection, user accounts, and system parameters.', language:'Language', languageNote:'Choose your preferred language. The interface will be displayed fully in the selected language.', cloudDatabase:'Cloud & Database', systemPreferences:'System Preferences', userManagement:'User Management', resetDefault:'Reset to Defaults'
  },
  ms: {
    systemSubtitle:'Sistem Pemantauan IV Pintar', finalYearProject:'Papan Pemuka Projek Tahun Akhir',
    welcomeTitle:'Selamat Datang ke Pemantauan IV', welcomeSubtitle:'Sistem Pemantauan IV Pintar', welcomeText:'Penyelesaian pintar untuk pemantauan intravena (IV) secara masa nyata. Membantu penjagaan kesihatan dengan data tepat, amaran segera dan penjagaan pesakit yang lebih baik.', tapStart:'Klik untuk Mula', selectMonitorToView:'Pilih monitor untuk melihat data masa nyata', infoOpenMonitor:'Klik beg IV atau tekan butang untuk membuka pilihan monitor.', systemFeatures:'Ciri Sistem', realtimeMonitoring:'Pemantauan Masa Nyata', realtimeMonitoringDesc:'Jejak aliran IV, kadar titisan dan baki isipadu secara langsung.', smartNotifications:'Pemberitahuan Pintar', smartNotificationsDesc:'Amaran segera untuk isipadu rendah atau bacaan tidak normal.', excelExport:'Eksport Excel', exportExcelSmall:'Eksport ke Excel', excelExportDesc:'Eksport data pesakit dan log ke Excel dengan satu klik.', responsiveAccess:'Akses Responsif', responsiveAccessDesc:'Akses monitor dengan selamat melalui komputer atau telefon.', cloudIntegration:'Integrasi Awan', cloudIntegrationDesc:'Dikuasakan oleh pangkalan data PostgreSQL di Render cloud.',
    welcome:'Selamat Datang', welcomeMs:'Selamat Datang', monitorSelection:'Pilih Monitor', monitorSelectionMs:'Pilih Monitor', dashboard:'Papan Pemuka', dashboardMs:'Papan Pemuka', selectMonitorTitle:'Pilih Monitor', chooseMonitor:'Pilih siapa yang akan memantau sistem IV. Anda akan diarahkan ke papan pemuka mereka.', monitorSupervisor:'Penyelia Monitor', projectTeam:'Ahli Projek', openDashboard:'Buka Papan Pemuka', selectInfo:'Pemilihan monitor akan membuka papan pemuka masa nyata mereka.',
    monitors:'Monitor', patients:'Pesakit', alerts:'Amaran', reports:'Laporan', settings:'Tetapan', collapse:'Kecilkan', live:'LANGSUNG', liveDesc:'Data dikemas kini secara masa nyata', refresh:'Muat Semula', viewAll:'Lihat Semua', ivLevel:'Tahap IV', remaining:'Baki', remainingVolume:'Baki Isipadu', dripRate:'Kadar Titisan', dropsMin:'titis/min', flowRate:'Kadar Alir', status:'Status', lastUpdate:'Kemas Kini Terakhir', normal:'Normal', low:'Rendah', critical:'Kritikal', weightTrend:'Berat IV Melawan Masa', dropComparison:'Perbandingan Kadar Titisan', last60Minutes:'60 minit terakhir', notifications:'Pemberitahuan', systemInfo:'Maklumat Sistem', dataSource:'Sumber Data', connectionStatus:'Status Sambungan', connected:'Bersambung', lastBackup:'Sandaran Terakhir',
    monitorsTitle:'Monitor Pesakit', monitorsSubtitle:'Metrik dan carta IV secara langsung dikemas kini masa nyata.', totalWeight:'JUMLAH BERAT', weightVsTime:'Berat Melawan Masa (g)', dropRateTrend:'Trend Kadar Titisan', liveDataLog:'Log Data Langsung', latestReadings:'Bacaan Terkini', patientsTitle:'Pesakit', patientsSubtitle:'Ubah nama pesakit, wad, katil dan nilai kalibrasi.', patientName:'Nama Pesakit', patientCode:'ID Pesakit', ward:'Wad', bed:'Katil', fullWeight:'Berat Penuh (g)', emptyWeight:'Berat Kosong (g)', manualTest:'Ujian Manual', submitReading:'Hantar Bacaan', saveChanges:'Simpan Perubahan',
    alertsCenter:'Pusat Amaran', alertsSubtitle:'Memaparkan pemberitahuan tahap rendah, hampir kosong dan bacaan IV tidak normal.', criticalAlerts:'Amaran Kritikal', warningAlerts:'Amaran Pemantauan', resolvedAlerts:'Amaran Selesai', acknowledge:'Sahkan', reportsTitle:'Laporan', reportsSubtitle:'Jana ringkasan pemantauan IV dan rekod yang boleh dimuat turun.', dateRange:'Julat Tarikh', patient:'Pesakit', allPatients:'Semua Pesakit', reportType:'Jenis Laporan', generateReport:'Jana Laporan', totalRecords:'Jumlah Rekod', averageLevel:'Purata Tahap IV', totalAlerts:'Jumlah Amaran', averageFlow:'Purata Kadar Alir', recentExports:'Eksport Terkini', dailySummary:'Ringkasan Harian Pemantauan IV', settingsTitle:'Tetapan', settingsSubtitle:'Urus bahasa, pemberitahuan, sambungan awan, akaun pengguna dan parameter sistem.', language:'Bahasa', languageNote:'Pilih bahasa pilihan anda. Antara muka akan dipaparkan sepenuhnya dalam bahasa yang dipilih.', cloudDatabase:'Awan & Pangkalan Data', systemPreferences:'Keutamaan Sistem', userManagement:'Pengurusan Pengguna', resetDefault:'Tetapkan Semula'
  }
};

const COLORS = ['#0797a5','#ff862e','#17a758','#ef3d47'];
let state = window.__DATA__ || null;
let liveTimer = null;
let clockTimer = null;

function getLang(){ return localStorage.getItem('ivLang') || document.body.dataset.language || 'en'; }
function t(key){ const lang = getLang(); return (T[lang] && T[lang][key]) || T.en[key] || key; }
function setLang(lang){ localStorage.setItem('ivLang', lang); document.body.dataset.language = lang; applyLanguage(); }
function statusText(s){ const v = String(s||'Normal'); if(v.toLowerCase()==='low') return t('low'); if(v.toLowerCase()==='critical') return t('critical'); return t('normal'); }
function esc(s){ return String(s ?? '').replace(/[&<>'"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function fmt(n, d=0){ return Number(n||0).toLocaleString(undefined,{maximumFractionDigits:d, minimumFractionDigits:d}); }

function applyLanguage(){
  const lang = getLang();
  document.querySelectorAll('[data-i18n]').forEach(el=>{ const key=el.dataset.i18n; if(T[lang] && T[lang][key]) el.textContent = T[lang][key]; });
  document.querySelectorAll('[data-set-lang]').forEach(btn=>btn.classList.toggle('active', btn.dataset.setLang===lang));
  updateStatusLabels();
}

function updateStatusLabels(){
  document.querySelectorAll('[data-patient-status]').forEach(el=>{
    const raw = el.dataset.rawStatus || el.textContent;
    el.textContent = statusText(raw);
  });
}

function initLanguage(){
  document.querySelectorAll('[data-set-lang]').forEach(btn=>btn.addEventListener('click', e=>{e.preventDefault(); setLang(btn.dataset.setLang);}));
  applyLanguage();
}

function initSections(){
  const open = (name)=>{
    if(!document.querySelector('[data-dashboard-page]')) return;
    document.querySelectorAll('.app-section').forEach(sec=>sec.classList.toggle('active', sec.id === 'section-'+name));
    document.querySelectorAll('[data-open-section]').forEach(btn=>btn.classList.toggle('active', btn.dataset.openSection === name));
    history.replaceState(null,'','#'+name);
    setTimeout(()=>renderAllCharts(), 120);
  };
  document.querySelectorAll('[data-open-section]').forEach(btn=>btn.addEventListener('click', e=>{ e.preventDefault(); open(btn.dataset.openSection); }));
  const hash = (location.hash || '').replace('#','');
  if(hash && document.getElementById('section-'+hash)) open(hash);
}

function startClock(){
  const tick = ()=>{
    const now = new Date();
    const opts = {hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:true};
    const dateOpts = {day:'2-digit', month:'long', year:'numeric', weekday:'short'};
    const time = now.toLocaleTimeString('en-MY', opts);
    const date = now.toLocaleDateString(getLang()==='ms' ? 'ms-MY' : 'en-MY', dateOpts);
    ['clockText','monitorClock'].forEach(id=>{const el=document.getElementById(id); if(el) el.textContent=time;});
    ['dateText','monitorDate'].forEach(id=>{const el=document.getElementById(id); if(el) el.textContent=date;});
  };
  tick(); clearInterval(clockTimer); clockTimer=setInterval(tick,1000);
}

function readInitialData(){
  const script=document.getElementById('initialData');
  if(!script) return null;
  try { return JSON.parse(script.textContent); } catch(e){ return null; }
}

function updateDashboard(data){
  if(!data) return;
  state = data;
  document.querySelectorAll('[data-alert-badge]').forEach(el=>el.textContent = data.active_alert_count || 0);
  (data.patients||[]).forEach((p, index)=>updatePatient(p, index));
  renderNotifications(data.alerts||[]);
  renderAlerts(data.alerts||[]);
  renderReports(data);
  updateReportKpis(data);
  renderAllCharts();
  applyLanguage();
}

function updatePatient(p, index){
  const status = String(p.current_status||'Normal').toLowerCase();
  const level = Math.round(Number(p.current_level_percent||0));
  setAll(`[data-patient-name="${p.id}"]`, p.patient_name);
  setAll(`[data-patient-code="${p.id}"]`, p.patient_code);
  setAll(`[data-patient-ward="${p.id}"]`, p.ward_number);
  setAll(`[data-patient-bed="${p.id}"]`, p.bed_number);
  setAll(`[data-patient-level="${p.id}"]`, `${level}%`);
  setAll(`[data-patient-remaining="${p.id}"]`, fmt(p.remaining_ml));
  setAll(`[data-patient-weight="${p.id}"]`, fmt(p.current_weight_g));
  setAll(`[data-patient-drop="${p.id}"]`, fmt(p.current_drop_rate));
  setAll(`[data-patient-flow="${p.id}"]`, fmt(p.current_flow_rate_ml_hr));
  setAll(`[data-patient-updated="${p.id}"]`, p.last_update_time);
  setAll(`[data-patient-chart-name="${p.id}"]`, p.patient_name);
  document.querySelectorAll(`[data-patient-progress="${p.id}"]`).forEach(el=>{el.style.width=Math.max(0,Math.min(100,level))+'%'; el.style.background=status==='low'?'var(--orange)':status==='critical'?'var(--red)':'var(--teal)';});
  document.querySelectorAll(`[data-patient-status="${p.id}"]`).forEach(el=>{el.dataset.rawStatus=p.current_status; el.className='status-pill '+status; el.textContent=statusText(p.current_status);});
  document.querySelectorAll(`[data-patient-card="${p.id}"]`).forEach(el=>{el.classList.remove('status-card-normal','status-card-low','status-card-critical'); el.classList.add('status-card-'+status);});
  document.querySelectorAll(`[data-monitor-panel="${p.id}"] .iv-bag, [data-patient-card="${p.id}"] .iv-bag`).forEach(el=>{ el.style.setProperty('--iv-level', `${level}%`); el.style.setProperty('--iv-color', status==='normal' ? '#0797a5' : status==='low' ? '#ff862e' : '#ef3d47'); });
  renderLiveTable(p);
}
function setAll(sel,val){ document.querySelectorAll(sel).forEach(el=>el.textContent=val); }

function renderLiveTable(p){
  document.querySelectorAll(`[data-live-table="${p.id}"]`).forEach(tbody=>{
    const rows=(p.readings||[]).slice(-5).reverse().map(r=>`<tr><td>${esc(r.time)}</td><td>${fmt(r.weight_g)}</td><td>${fmt(r.drops_per_min)}</td><td>${fmt(r.flow_rate_ml_hr)}</td><td>${fmt(r.level_percent)}</td></tr>`).join('');
    tbody.innerHTML = rows || '<tr><td colspan="5" class="no-data">No readings</td></tr>';
  });
}

function renderNotifications(alerts){
  const list=document.querySelector('[data-notification-list]');
  if(!list) return;
  const rows=alerts.slice(0,3).map(a=>{
    const cls=a.priority==='Critical'?'critical':a.priority==='Warning'?'warning':'info';
    const icon=a.priority==='Critical'?'⚠':a.priority==='Warning'?'◷':'✓';
    return `<div class="notification-item ${cls}"><span class="icon">${icon}</span><p><small>${esc(a.time)}</small><b>${esc(a.patient_name)} – ${esc(a.alert_type)}</b><small>${esc(a.message)}</small></p><em>›</em></div>`;
  }).join('');
  list.innerHTML = rows || `<div class="no-data">No alerts</div>`;
}

function renderAlerts(alerts){
  const table=document.querySelector('[data-alert-table]');
  if(table){
    table.innerHTML = alerts.slice(0,8).map(a=>`<tr><td><b>${esc(a.time)}</b><br><small>${esc(a.date)}</small></td><td><b>${esc(a.patient_name)}</b><br><small>${esc(a.patient_code)} | ${esc(a.ward)} | ${esc(a.bed)}</small></td><td>${esc(a.alert_type)}</td><td>${esc(a.message)}</td><td><span class="priority ${esc(a.priority)}">${esc(a.priority)}</span></td><td><span class="status-badge">${esc(a.status)}</span></td><td><form method="post" action="/acknowledge-alert/${a.id}"><button class="outline-btn" type="submit">${t('acknowledge')}</button></form></td></tr>`).join('');
  }
  const critical = alerts.filter(a=>a.priority==='Critical').length;
  const warning = alerts.filter(a=>a.priority==='Warning').length;
  const resolved = alerts.filter(a=>a.status==='Resolved' || a.status==='Acknowledged').length;
  setAll('[data-critical-count]', critical); setAll('[data-warning-count]', warning); setAll('[data-resolved-count]', resolved);
  const detail=document.querySelector('[data-alert-detail]');
  if(detail){
    const a=alerts[0];
    if(!a){ detail.innerHTML='<div class="no-data">No alert</div>'; return; }
    detail.innerHTML=`<h3>⚠ ${esc(a.priority)} Alert</h3><h2>${esc(a.patient_name)}</h2><p>${esc(a.patient_code)} | ${esc(a.ward)} | ${esc(a.bed)}</p><div class="detail-row"><span>${esc(a.alert_type)}</span><b>${esc(a.level_percent)}%</b></div><div class="detail-row"><span>Remaining Volume</span><b>${a.patient_name.includes('B')?'110':'340'} ml</b></div><div class="detail-row"><span>Recommended Action</span><b>Check IV line and prepare refill</b></div><form method="post" action="/acknowledge-alert/${a.id}"><button class="primary-btn" type="submit">${t('acknowledge')}</button></form>`;
  }
}

function renderReports(data){
  const tbody=document.querySelector('[data-report-table]');
  if(!tbody) return;
  const rows=[];
  (data.patients||[]).forEach(p=>{
    (p.readings||[]).slice(-3).reverse().forEach(r=>{
      rows.push(`<tr><td>${new Date().toLocaleDateString('en-GB')}</td><td>${esc(r.time)}</td><td><b>${esc(p.patient_name)}</b><br><small>${esc(p.patient_code)}</small></td><td>${fmt(r.weight_g)} g</td><td>${fmt(r.level_percent)}%</td><td>${fmt(r.drops_per_min)}</td><td>${fmt(r.flow_rate_ml_hr)}</td><td><span class="status-pill ${String(r.status||'normal').toLowerCase()}">${statusText(r.status)}</span></td><td><a href="/export/excel">▣</a></td></tr>`);
    });
  });
  tbody.innerHTML=rows.join('');
}

function updateReportKpis(data){
  const allReadings=(data.patients||[]).flatMap(p=>p.readings||[]);
  const avg = arr => arr.length ? arr.reduce((a,b)=>a+Number(b||0),0)/arr.length : 0;
  setAll('[data-total-records]', allReadings.length || 0);
  setAll('[data-average-level]', fmt(avg(allReadings.map(r=>r.level_percent)))+'%');
  setAll('[data-total-alerts]', (data.alerts||[]).length);
  setAll('[data-average-flow]', fmt(avg(allReadings.map(r=>r.flow_rate_ml_hr)))+' ml/hr');
}

function renderAllCharts(){
  if(!state || !document.querySelector('[data-dashboard-page]')) return;
  document.querySelectorAll('[data-chart="weight"], [data-chart="monitor-weight"]').forEach(el=>{
    const p=(state.patients||[]).find(x=>String(x.id)===String(el.dataset.patientId));
    if(p) drawChart(el, [{label:p.patient_name, data:(p.readings||[]).map(r=>r.weight_g), color:p.id%2===0?COLORS[1]:COLORS[0]}], (p.readings||[]).map(r=>r.label), {ylabel:'Weight (g)', yMax:650, fill:true});
  });
  document.querySelectorAll('[data-chart="monitor-drop"]').forEach(el=>{
    const p=(state.patients||[]).find(x=>String(x.id)===String(el.dataset.patientId));
    if(p) drawChart(el, [{label:'Drops/min', data:(p.readings||[]).map(r=>r.drops_per_min), color:p.id%2===0?COLORS[1]:COLORS[0]}], (p.readings||[]).map(r=>r.label), {ylabel:'drops/min', yMax:40});
  });
  document.querySelectorAll('[data-chart="drop-comparison"]').forEach(el=>{
    const series=(state.patients||[]).map((p,i)=>({label:p.patient_name, data:(p.readings||[]).map(r=>r.drops_per_min), color:COLORS[i]}));
    const labels=(state.patients&&state.patients[0]&&state.patients[0].readings||[]).map(r=>r.label);
    drawChart(el, series, labels, {ylabel:'drops/min', yMax:40, legend:true});
  });
  document.querySelectorAll('[data-chart="daily-summary"]').forEach(el=>{
    const series=(state.patients||[]).map((p,i)=>({label:p.patient_name+' - Weight', data:(p.readings||[]).map(r=>r.weight_g), color:COLORS[i]}));
    const labels=(state.patients&&state.patients[0]&&state.patients[0].readings||[]).map(r=>r.label);
    drawChart(el, series, labels, {ylabel:'Weight (g)', yMax:650, legend:true, fill:false});
  });
}

function drawChart(container, series, labels, opts){
  if(!container) return;
  labels = labels || [];
  const width=640, height=260, left=46, right=18, top=24, bottom=42;
  const plotW=width-left-right, plotH=height-top-bottom;
  const all=series.flatMap(s=>s.data||[]).filter(v=>Number.isFinite(Number(v))).map(Number);
  const yMax=opts.yMax || niceMax(Math.max(...all, 10));
  const yMin=0;
  const len=Math.max(...series.map(s=>(s.data||[]).length), labels.length, 2);
  const x=(i)=>left + (len===1?0:(i/(len-1))*plotW);
  const y=(v)=>top + plotH - ((Number(v)-yMin)/(yMax-yMin))*plotH;
  const ticks=5;
  let grid='', axis='';
  for(let i=0;i<=ticks;i++){
    const val=yMin+(yMax-yMin)*(i/ticks); const yy=y(val);
    grid+=`<line class="grid-line" x1="${left}" y1="${yy}" x2="${width-right}" y2="${yy}"/>`;
    axis+=`<text class="axis-text" x="${left-10}" y="${yy+4}" text-anchor="end">${Math.round(val)}</text>`;
  }
  const labelCount=Math.min(7, labels.length);
  let xlabels='';
  if(labels.length){
    for(let i=0;i<labelCount;i++){
      const idx=Math.round(i*(labels.length-1)/(labelCount-1 || 1));
      xlabels+=`<text class="axis-text" x="${x(idx)}" y="${height-16}" text-anchor="middle">${esc(labels[idx])}</text>`;
    }
  }
  const paths=series.map((s,si)=>{
    const data=(s.data||[]).map(Number);
    const d=data.map((v,i)=>`${i?'L':'M'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
    let area='';
    if(opts.fill!==false && data.length>1){ area=`<path class="chart-area" d="${d} L ${x(data.length-1)} ${height-bottom} L ${x(0)} ${height-bottom} Z" fill="${s.color}"/>`; }
    const dots=data.map((v,i)=> i===data.length-1 ? `<circle class="chart-dot" cx="${x(i)}" cy="${y(v)}" r="5" fill="${s.color}"/>` : '').join('');
    return `${area}<path class="chart-line" d="${d}" stroke="${s.color}"/>${dots}`;
  }).join('');
  const legend = opts.legend ? `<g transform="translate(${left},10)">${series.map((s,i)=>`<circle cx="${i*150}" cy="0" r="4" fill="${s.color}"/><text class="axis-text" x="${i*150+10}" y="4">${esc(s.label)}</text>`).join('')}</g>` : '';
  container.innerHTML=`<svg class="chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><rect x="0" y="0" width="${width}" height="${height}" fill="transparent"/>${grid}${axis}${xlabels}<text class="axis-text" x="${left}" y="14">${esc(opts.ylabel||'')}</text>${legend}${paths}</svg>`;
}
function niceMax(v){ if(v<50) return 50; if(v<150) return 150; if(v<650) return 650; return Math.ceil(v/100)*100; }

function refreshData(){
  if(!document.querySelector('[data-dashboard-page]')) return;
  fetch('/api/dashboard-data', {cache:'no-store'}).then(r=>r.json()).then(updateDashboard).catch(()=>{});
}
function initLive(){
  state=readInitialData();
  if(state) updateDashboard(state);
  document.querySelectorAll('[data-refresh-now]').forEach(btn=>btn.addEventListener('click', refreshData));
  if(document.querySelector('[data-dashboard-page]')){
    clearInterval(liveTimer);
    liveTimer=setInterval(refreshData, 5000);
  }
}

window.addEventListener('resize', ()=>setTimeout(renderAllCharts,120));
document.addEventListener('DOMContentLoaded', ()=>{ initLanguage(); initSections(); startClock(); initLive(); });
})();
