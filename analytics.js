// ══════════════════════════════════════════════════════
// POLITECH — analytics.js  (API-connected analytics logic)
// ══════════════════════════════════════════════════════

const API = 'http://127.0.0.1:8000';

const token = localStorage.getItem('pt_token');
if (!token) { window.location.replace('login.html'); }

const headers = {
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json'
};

// ── THEME PERSISTENCE ─────────────────────────────────
// Reads the theme saved by police.html (or itself) and applies it immediately
let isDark = localStorage.getItem('pt_theme') !== 'light';

(function applyTheme() {
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  const icon  = document.getElementById('themeIcon');
  const label = document.getElementById('themeLabel');
  if (icon)  icon.className = isDark ? 'fas fa-moon' : 'fas fa-sun';
  if (label) label.textContent = isDark ? 'Night Watch' : 'Day Mode';
})();

function toggleTheme() {
  isDark = !isDark;
  localStorage.setItem('pt_theme', isDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  document.getElementById('themeIcon').className = isDark ? 'fas fa-moon' : 'fas fa-sun';
  document.getElementById('themeLabel').textContent = isDark ? 'Night Watch' : 'Day Mode';
}

// ── BACK BUTTON ───────────────────────────────────────
function goBack() {
  if (document.referrer && document.referrer !== window.location.href) {
    history.back();
  } else {
    // Fallback if no referrer (e.g. opened directly)
    window.location.replace('police.html');
  }
}

// ── LOGOUT ────────────────────────────────────────────
function logout() {
  localStorage.removeItem('pt_token');
  localStorage.removeItem('pt_role');
  localStorage.removeItem('pt_user');
  window.location.replace('login.html');
}

// ── USER INFO ─────────────────────────────────────────
(function showUser() {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const el = document.getElementById('userInfo');
    if (el) el.textContent = `${payload.sub.toUpperCase()} (${payload.role})`;
  } catch (e) { console.warn('Token parse error:', e); }
})();

// ── DATE BADGE ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const dateBadge = document.querySelector('.date-badge');
  if (dateBadge) {
    const now = new Date();
    dateBadge.innerHTML = `<i class="fas fa-calendar-days"></i> ${now.toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}`;
  }
  loadAnalytics();
});

// ── MAIN LOADER ───────────────────────────────────────
async function loadAnalytics() {
  try {
    const [
      kpiRes, heatmapRes, rtRes, dayRes, typeRes, deployRes, priorityRes, perfRes
    ] = await Promise.all([
      fetch(`${API}/api/v1/analytics/kpi`, { headers }),
      fetch(`${API}/api/v1/analytics/heatmap`, { headers }),
      fetch(`${API}/api/v1/analytics/response-time`, { headers }),
      fetch(`${API}/api/v1/analytics/incidents-by-day`, { headers }),
      fetch(`${API}/api/v1/analytics/incidents-by-type`, { headers }),
      fetch(`${API}/api/v1/analytics/officers-deployed`, { headers }),
      fetch(`${API}/api/v1/analytics/priority-distribution`, { headers }),
      fetch(`${API}/api/v1/analytics/officer-performance`, { headers })
    ]);

    // Check auth
    if (kpiRes.status === 401 || kpiRes.status === 403) {
      localStorage.clear();
      window.location.replace('login.html');
      return;
    }

    if (!kpiRes.ok) throw new Error('Failed to fetch analytics data from backend');

    const [
      kpi, heatmap, rt, dayData, typeData, deployData, priority, perf
    ] = await Promise.all([
      kpiRes.json(), heatmapRes.json(), rtRes.json(),
      dayRes.json(), typeRes.json(), deployRes.json(),
      priorityRes.json(), perfRes.json()
    ]);

    renderKPIs(kpi);
    renderHeatmap(heatmap);
    renderResponseTime(rt);
    buildBarChart('dayChart',    'dayLabels',    dayData,    ['blue']);
    buildBarChart('typeChart',   'typeLabels',   typeData,   ['blue', 'violet', 'amber', 'green', 'red']);
    buildBarChart('deployChart', 'deployLabels', deployData, ['green']);
    renderPriority(priority);
    renderPerformance(perf);

  } catch (err) {
    console.error('[Analytics]', err);
    // Show a user-friendly fallback message
    toast(err.message.includes('fetch') 
      ? 'Cannot reach backend — is the server running?'
      : 'Failed to load analytics data', 'error');
  }
}

// ── RENDERERS ─────────────────────────────────────────
function renderKPIs(kpi) {
  const incEl = document.getElementById('kpi-incidents');
  if (incEl) incEl.textContent = kpi.totalIncidentsMTD;

  const mt = kpi.totalIncidentsMTDTrend;
  const blueTrend = document.querySelector('.kpi-card.kpi-blue .kpi-trend');
  if (blueTrend) {
    blueTrend.innerHTML = `<i class="fas fa-arrow-${mt >= 0 ? 'up' : 'down'}"></i> ${Math.abs(mt)}% from last month`;
    blueTrend.className = `kpi-trend ${mt <= 0 ? 'trend-down' : 'trend-up'}`;
  }

  const greenVal = document.querySelector('.kpi-card.kpi-green .kpi-val');
  if (greenVal) greenVal.innerHTML = `${kpi.avgResponseTimeMin}<span style="font-size:1rem;font-weight:600"> min</span>`;

  const redVal = document.querySelector('.kpi-card.kpi-red .kpi-val');
  if (redVal) redVal.textContent = kpi.criticalIncidentsToday;

  const ct = kpi.criticalTrendFromYesterday;
  const redTrend = document.querySelector('.kpi-card.kpi-red .kpi-trend');
  if (redTrend) {
    redTrend.innerHTML = `<i class="fas fa-arrow-${ct >= 0 ? 'up' : 'down'}"></i> ${Math.abs(ct)} from yesterday`;
    redTrend.className = `kpi-trend ${ct <= 0 ? 'trend-down' : 'trend-up'}`;
  }

  const violetVal = document.querySelector('.kpi-card.kpi-violet .kpi-val');
  if (violetVal) violetVal.innerHTML = `${kpi.dutyCompletionRate}<span style="font-size:1rem;font-weight:600">%</span>`;
}

function renderHeatmap(heatmap) {
  const grid = document.getElementById('heatmapGrid');
  if (!grid) return;
  grid.innerHTML = '';

  const monthLabels = document.getElementById('hmap-month-labels');
  const rowLabels   = document.getElementById('hmap-row-labels');
  if (monthLabels) monthLabels.innerHTML = heatmap.months.map(m => `<span class="hmap-label">${m}</span>`).join('');
  if (rowLabels)   rowLabels.innerHTML   = heatmap.sectors.map(s => `<span>${s}</span>`).join('');

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 12; c++) {
      const v = heatmap.data[r][c];
      const cell = document.createElement('div');
      cell.className = 'hmap-cell';
      cell.title = `${heatmap.sectors[r]} — ${heatmap.months[c]}`;
      const alpha = 0.1 + v * 0.9;
      if (v < 0.33)      cell.style.background = `rgba(59,130,246,${alpha})`;
      else if (v < 0.66) cell.style.background = `rgba(245,158,11,${alpha})`;
      else               cell.style.background = `rgba(239,68,68,${alpha})`;
      grid.appendChild(cell);
    }
  }
}

function renderResponseTime(rt) {
  const gaugeVal = document.querySelector('.gauge-val');
  if (gaugeVal) gaugeVal.textContent = rt.avgMin;

  const offset = 251 - (251 * (rt.avgMin / Math.max(rt.avgMin * 1.5, 10)));
  const gaugePath = document.getElementById('gaugePath');
  if (gaugePath) gaugePath.style.strokeDashoffset = Math.max(0, offset);

  const stats = document.querySelectorAll('.rs-val');
  if (stats.length >= 3) {
    stats[0].textContent = rt.bestMin;
    stats[1].textContent = rt.avgMin;
    stats[2].textContent = rt.worstMin;
  }

  const tbody = document.querySelector('.shift-table tbody');
  if (tbody) {
    tbody.innerHTML = rt.byShift.map(s => `
      <tr>
        <td>${s.shift}</td>
        <td>${s.avgMin} min</td>
        <td><span class="pill ${s.load === 'High' ? 'high' : s.load === 'Normal' ? 'normal' : 'low'}">${s.load}</span></td>
      </tr>
    `).join('');
  }
}

function buildBarChart(containerId, labelId, data, colors) {
  const container = document.getElementById(containerId);
  const labelEl   = document.getElementById(labelId);
  if (!container || !labelEl) return;
  const max = Math.max(...data.map(d => d.val), 1);
  container.innerHTML = data.map((d, i) => `
    <div class="bar-col">
      <div class="bar ${colors[i % colors.length]}"
           style="height:${Math.max((d.val / max) * 100, 4)}%"
           data-val="${d.val}"
           title="${d.label}: ${d.val}"></div>
    </div>`).join('');
  labelEl.innerHTML = data.map(d => `<span class="x-lbl">${d.label}</span>`).join('');
}

function renderPriority(priority) {
  const svg = document.querySelector('.donut-wrap svg');
  if (!svg) return;
  const colors = { 'Critical': '#ef4444', 'High': '#f59e0b', 'Medium': '#3b82f6', 'Low': '#10b981' };
  const d = priority.distribution;

  let svgContent = `<circle cx="70" cy="70" r="50" fill="none" stroke="var(--navy-3)" stroke-width="22"/>`;
  let legendHtml = '';
  let currentAngle = -90;

  for (const p of d) {
    const dashLength = (p.percent / 100) * 314;
    svgContent += `<circle cx="70" cy="70" r="50" fill="none" stroke="${colors[p.priority] || '#94a3b8'}" stroke-width="22" stroke-dasharray="314" stroke-dashoffset="${314 - dashLength}" stroke-linecap="butt" transform="rotate(${currentAngle} 70 70)"/>`;
    currentAngle += (p.percent / 100) * 360;
    legendHtml += `<div class="dl-item"><div class="dl-dot" style="background:${colors[p.priority] || '#94a3b8'}"></div><span class="dl-label">${p.priority}</span><span class="dl-val" style="color:${colors[p.priority] || '#94a3b8'}">${p.percent}%</span></div>`;
  }

  svgContent += `<text x="70" y="66" text-anchor="middle" fill="var(--text)" font-size="13" font-weight="900" font-family="Inter">${priority.total}</text>
                 <text x="70" y="80" text-anchor="middle" fill="var(--text-muted)" font-size="7" font-family="Inter">TOTAL</text>`;
  svg.innerHTML = svgContent;

  const legend = document.querySelector('.donut-legend');
  if (legend) legend.innerHTML = legendHtml;
}

function renderPerformance(perf) {
  // The performance table is the 2nd shift-table on the page
  const tbodies = document.querySelectorAll('.shift-table tbody');
  const tbody = tbodies[1];
  if (!tbody) return;
  tbody.innerHTML = perf.slice(0, 5).map(p => `
    <tr>
      <td>${p.rank}</td>
      <td><b>${p.name}</b></td>
      <td>${p.dutiesCompleted}</td>
      <td>${p.avgResponseMin ? p.avgResponseMin + ' min' : 'N/A'}</td>
      <td><span class="pill ${p.rating > 90 ? 'normal' : p.rating > 70 ? 'high' : 'low'}">⭐ ${p.rating}%</span></td>
    </tr>
  `).join('');
}

// ── TOAST ─────────────────────────────────────────────
function toast(msg, type = 'success') {
  const c = document.getElementById('toastContainer');
  if (!c) return;
  const t = document.createElement('div');
  const icons = { success: 'fa-check-circle', info: 'fa-circle-info', error: 'fa-triangle-exclamation' };
  t.className = `toast ${type}`;
  t.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${msg}</span>`;
  c.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateX(120%)';
    t.style.transition = 'all 0.4s';
    setTimeout(() => t.remove(), 400);
  }, 3500);
}

// ── EXPORTS ───────────────────────────────────────────
function exportPDF()   { toast('Generating PDF report…', 'info'); }
function exportExcel() { toast('Exporting Excel spreadsheet…', 'info'); }
