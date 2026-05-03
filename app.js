// ══════════════════════════════════════════════════════
// POLITECH — app.js  (API-connected frontend logic)
// ══════════════════════════════════════════════════════

const API  = 'http://127.0.0.1:8000';
const WS_URL = 'ws://127.0.0.1:8000/ws';

// ── Auth helpers ──────────────────────────────────────
function getToken() { return localStorage.getItem('pt_token') || ''; }
function getRole()  { return localStorage.getItem('pt_role')  || ''; }

function authHeaders() {
  return { 'Authorization': 'Bearer ' + getToken(), 'Content-Type': 'application/json' };
}

// Redirect to login if no token
if (!getToken()) { window.location.replace('login.html'); }

async function apiFetch(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: { ...authHeaders(), ...(opts.headers || {}) }
  });
  if (res.status === 401) { localStorage.clear(); window.location.replace('login.html'); }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || res.statusText);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ── State ─────────────────────────────────────────────
let officers  = [];
let duties    = [];
let incidents = [];
let alerts    = [];
let draggedOfficerId = null;

const incidentTypes = ['Break-in Report','Vehicle Pursuit','Missing Person','Disturbance Call','Drug Suspicion','Fire Assist','Vandalism','Assault Report'];
const incidentLocs  = ['SIT Extension','Ashoka Road','BH Road Jnc','APMC Yard','Kuvempunagar','Gandhinagar','Jayanagar','Saraswathipuram'];
const priorities    = ['Low','Medium','High','Critical'];

// ── Helpers ───────────────────────────────────────────
function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
}
function fmtLastSeen(iso) {
  if (!iso) return '—';
  const diff = Math.round((Date.now() - new Date(iso)) / 60000);
  if (diff < 1)  return 'Just now';
  if (diff === 1) return '1 min ago';
  if (diff < 60)  return diff + ' min ago';
  return Math.round(diff/60) + ' hr ago';
}

// ── THEME ─────────────────────────────────────────────
// Persist theme across pages via localStorage
let isDark = localStorage.getItem('pt_theme') !== 'light';
const LIGHT_MAP_STYLE = [
  { featureType:'poi',     stylers:[{visibility:'off'}] },
  { featureType:'transit', stylers:[{visibility:'off'}] }
];

// Apply saved theme on load
(function applyThemeOnLoad() {
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
  document.getElementById('themeIcon').className  = isDark ? 'fas fa-moon' : 'fas fa-sun';
  document.getElementById('themeLabel').textContent = isDark ? 'Night Watch' : 'Day Mode';
  if (map) map.setOptions({ styles: isDark ? DARK_MAP_STYLE : LIGHT_MAP_STYLE });
}

// ── PAGE SWITCHING ────────────────────────────────────
// skipLoad=true is used by panToOfficer to avoid triggering loadUI during drag operations
function switchPage(page, el, skipLoad) {
  document.querySelectorAll('.page-view').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelectorAll('.topbar-nav a, .nav-item').forEach(a => a.classList.remove('active'));
  if (el) el.classList.add('active');
  if (!skipLoad) loadUI();
}

// ── DRAWERS / PANELS ──────────────────────────────────
function openDrawer()  { document.getElementById('alertDrawer').classList.add('open');    document.getElementById('drawerOverlay').classList.add('open'); renderAlerts(); }
function closeDrawer() { document.getElementById('alertDrawer').classList.remove('open'); document.getElementById('drawerOverlay').classList.remove('open'); }
function openAction()  { document.getElementById('actionPanel').classList.add('open');    document.getElementById('actionOverlay').classList.add('open'); }
function closeAction() { document.getElementById('actionPanel').classList.remove('open'); document.getElementById('actionOverlay').classList.remove('open'); }
function openModal()   { document.getElementById('editModal').style.display = 'flex'; }
function closeModal()  { document.getElementById('editModal').style.display = 'none'; }

// ── ALERTS ────────────────────────────────────────────
function renderAlerts() {
  const list = document.getElementById('alertList');
  if (!list) return;
  list.innerHTML = alerts.map(a => `
    <div class="alert-item">
      <div class="alert-icon ${a.type}"><i class="fas ${a.icon}"></i></div>
      <div class="alert-content">
        <div class="alert-title">${a.title}</div>
        <div class="alert-desc">${a.desc || a.description || ''}</div>
        <div class="alert-time"><i class="fas fa-clock"></i> ${fmtTime(a.time)}</div>
      </div>
    </div>`).join('');
}

// ── TOAST ─────────────────────────────────────────────
function toast(msg, type = 'success') {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  const icons = { success:'fa-check-circle', error:'fa-circle-xmark', info:'fa-circle-info' };
  t.className = `toast ${type}`;
  t.innerHTML = `<i class="fas ${icons[type]||icons.info}"></i><span>${msg}</span>`;
  c.appendChild(t);
  setTimeout(() => { t.style.opacity='0'; t.style.transform='translateX(120%)'; t.style.transition='all 0.4s'; setTimeout(()=>t.remove(),400); }, 3500);
}

// ── MAP GLOBALS ───────────────────────────────────────
const MAP_CENTER = { lat:13.3392, lng:77.1016 };
let map = null, activeInfoWindow = null, officerMarkers = {}, incidentMarkers = {};

const DARK_MAP_STYLE = [
  { elementType:'geometry',          stylers:[{color:'#0f172a'}] },
  { elementType:'labels.text.fill',  stylers:[{color:'#94a3b8'}] },
  { elementType:'labels.text.stroke',stylers:[{color:'#0f172a'}] },
  { featureType:'administrative',       elementType:'geometry.stroke',          stylers:[{color:'#334155'}] },
  { featureType:'administrative.locality', elementType:'labels.text.fill',      stylers:[{color:'#60a5fa'}] },
  { featureType:'road',                 elementType:'geometry',                 stylers:[{color:'#1e293b'}] },
  { featureType:'road',                 elementType:'geometry.stroke',          stylers:[{color:'#334155'}] },
  { featureType:'road.highway',         elementType:'geometry',                 stylers:[{color:'#1e3a5f'}] },
  { featureType:'road.highway',         elementType:'geometry.stroke',          stylers:[{color:'#3b82f6'}] },
  { featureType:'road.highway',         elementType:'labels.text.fill',         stylers:[{color:'#60a5fa'}] },
  { featureType:'water',                elementType:'geometry',                 stylers:[{color:'#0a1628'}] },
  { featureType:'water',                elementType:'labels.text.fill',         stylers:[{color:'#3b82f6'}] },
  { featureType:'poi',     stylers:[{visibility:'off'}] },
  { featureType:'transit', stylers:[{visibility:'off'}] }
];

function initMap() {
  map = new google.maps.Map(document.getElementById('googleMap'), {
    center: MAP_CENTER, zoom: 13,
    styles: DARK_MAP_STYLE,
    disableDefaultUI: true,
    zoomControl: true,
    zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_CENTER },
    backgroundColor: '#0f172a'
  });
  renderMap();
}

function makeOfficerIcon(status) {
  const c = status==='available' ? '#10b981' : status==='assigned' ? '#3b82f6' : '#64748b';
  const s = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="11" fill="${c}" opacity="0.88"/><circle cx="16" cy="16" r="15" fill="none" stroke="${c}" stroke-width="2" opacity="0.4"/><text x="16" y="20" text-anchor="middle" fill="white" font-size="11" font-family="Inter,sans-serif" font-weight="800">P</text></svg>`;
  return { url:'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent(s), scaledSize:new google.maps.Size(32,32), anchor:new google.maps.Point(16,16) };
}
function makeIncidentIcon(priority) {
  const c = priority==='Critical' ? '#ef4444' : priority==='High' ? '#f59e0b' : priority==='Medium' ? '#3b82f6' : '#10b981';
  const s = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><polygon points="14,2 26,25 2,25" fill="${c}" opacity="0.9"/><text x="14" y="22" text-anchor="middle" fill="white" font-size="12" font-family="Inter,sans-serif" font-weight="900">!</text></svg>`;
  return { url:'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent(s), scaledSize:new google.maps.Size(28,28), anchor:new google.maps.Point(14,25) };
}

function renderMap() {
  if (!map) return;
  if (activeInfoWindow) { activeInfoWindow.close(); activeInfoWindow = null; }
  Object.values(officerMarkers).forEach(m => m.setMap(null));
  Object.values(incidentMarkers).forEach(m => m.setMap(null));
  officerMarkers = {}; incidentMarkers = {};

  officers.forEach(o => {
    if (!o.mapPos) return;
    const marker = new google.maps.Marker({ position:o.mapPos, map, icon:makeOfficerIcon(o.status), title:`${o.name} — ${o.status}` });
    const sc = o.status==='available' ? '#10b981' : o.status==='assigned' ? '#3b82f6' : '#64748b';
    const iw = new google.maps.InfoWindow({ content:`<div style="background:#1e293b;color:#e2e8f0;padding:12px 14px;border-radius:10px;font-family:Inter,sans-serif;min-width:155px;"><div style="font-weight:800;font-size:.9rem;margin-bottom:3px;">${o.name}</div><div style="font-size:.75rem;color:#94a3b8;">${o.rank} · ${o.badge}</div><div style="margin-top:7px;font-size:.75rem;font-weight:700;color:${sc};">● ${o.status}</div><div style="font-size:.7rem;color:#94a3b8;margin-top:2px;">Last seen: ${o.lastSeen}</div></div>` });
    marker.addListener('click', () => { if(activeInfoWindow) activeInfoWindow.close(); iw.open(map,marker); activeInfoWindow=iw; });
    officerMarkers[o.id] = marker;
  });

  incidents.forEach(inc => {
    if (!inc.mapPos) return;
    const marker = new google.maps.Marker({ position:inc.mapPos, map, icon:makeIncidentIcon(inc.priority), title:`${inc.type} — ${inc.priority}`, zIndex:10 });
    const pc = inc.priority==='Critical' ? '#ef4444' : inc.priority==='High' ? '#f59e0b' : inc.priority==='Medium' ? '#3b82f6' : '#10b981';
    const assigned = inc.assignedTo ? `<div style="font-size:.72rem;color:#10b981;margin-top:4px;">👮 ${inc.assignedTo}</div>` : '';
    const iw = new google.maps.InfoWindow({ content:`<div style="background:#1e293b;color:#e2e8f0;padding:12px 14px;border-radius:10px;font-family:Inter,sans-serif;min-width:180px;"><div style="font-weight:800;font-size:.9rem;margin-bottom:3px;">${inc.type}</div><div style="font-size:.75rem;color:#94a3b8;margin-bottom:7px;">📍 ${inc.location}</div><div style="font-size:.78rem;font-weight:700;color:${pc};">Priority: ${inc.priority}</div><div style="font-size:.72rem;color:#94a3b8;margin-top:3px;">🕐 ${inc.time}</div>${assigned}</div>` });
    marker.addListener('click', () => { if(activeInfoWindow) activeInfoWindow.close(); iw.open(map,marker); activeInfoWindow=iw; });
    incidentMarkers[inc.id] = marker;
  });
}

function mapZoom(dir) { if (map) map.setZoom((map.getZoom()||13)+dir); }

function panToOfficer(officerId) {
  // Only pan if not currently dragging an officer card
  if (draggedOfficerId) return;
  if (!map) return;
  const o = officers.find(x => x.id===officerId);
  if (!o || !o.mapPos) return;
  // Use skipLoad=true to avoid re-rendering during a potential drag session
  switchPage('dashboard', document.querySelector('.topbar-nav a'), true);
  loadUI(); // explicit single call after page switch
  map.panTo(o.mapPos); map.setZoom(15);
  setTimeout(() => { if(officerMarkers[officerId]) google.maps.event.trigger(officerMarkers[officerId],'click'); }, 450);
}

// ── INCIDENT FEED ─────────────────────────────────────
function renderFeed() {
  const feed = document.getElementById('incidentFeed');
  if (!feed) return;
  feed.innerHTML = incidents.map(inc => `
    <div class="incident-card" id="inc-${inc.id}"
      ondragover="event.preventDefault();document.getElementById('inc-${inc.id}').classList.add('drop-target')"
      ondragleave="document.getElementById('inc-${inc.id}').classList.remove('drop-target')"
      ondrop="dropOnIncident(event,${inc.id})">
      <div class="incident-top">
        <div class="incident-type">${inc.type}</div>
        <div class="incident-time"><i class="fas fa-clock"></i> ${inc.time}</div>
      </div>
      <div class="incident-loc"><i class="fas fa-location-dot"></i>${inc.location}</div>
      <div class="incident-footer">
        <span class="priority-pill p-${inc.priority.toLowerCase()}">${inc.priority}</span>
        <span class="assign-drop-zone">${inc.assignedTo ? '👮 '+inc.assignedTo : 'Drop officer here'}</span>
      </div>
    </div>`).join('');
}

async function addRandomIncident() {
  const body = {
    type: incidentTypes[Math.floor(Math.random()*incidentTypes.length)],
    location: incidentLocs[Math.floor(Math.random()*incidentLocs.length)],
    priority: priorities[Math.floor(Math.random()*priorities.length)],
    mapPos: { lat: MAP_CENTER.lat+(Math.random()-0.5)*0.06, lng: MAP_CENTER.lng+(Math.random()-0.5)*0.06 }
  };
  try {
    await apiFetch('/api/v1/incidents', { method:'POST', body:JSON.stringify(body) });
    await refreshAll();
    toast(`New incident: ${body.type}`, 'info');
  } catch(e) { toast(e.message,'error'); }
}

// ── DRAG & DROP ───────────────────────────────────────
function dragStart(e, officerId) {
  draggedOfficerId = officerId;
  if (e && e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', officerId.toString());
  }
  // Stop click event from propagating to panToOfficer during drag
  e.stopPropagation();
}

async function dropOnIncident(e, incId) {
  e.preventDefault();
  document.getElementById('inc-'+incId)?.classList.remove('drop-target');
  document.getElementById('finc-'+incId)?.classList.remove('drag-over');
  if (!draggedOfficerId) return;
  const o = officers.find(o => o.id===draggedOfficerId);
  if (!o || o.status!=='available') { toast('Officer is not available!','error'); return; }
  try {
    await apiFetch(`/api/v1/incidents/${incId}/assign`, {
      method:'PATCH', body: JSON.stringify({ officerId: draggedOfficerId })
    });
    draggedOfficerId = null;
    await refreshAll();
    toast(`${o.name} deployed to incident!`, 'success');
  } catch(e) { toast(e.message,'error'); }
}

// ── FORCE GRID ────────────────────────────────────────
function renderForceGrid() {
  const grid = document.getElementById('forceGrid');
  if (!grid) return;
  grid.innerHTML = officers.map(o => `
    <div class="officer-card" draggable="true"
      onclick="panToOfficer(${o.id})"
      ondragstart="dragStart(event, ${o.id})"
      ondragend="draggedOfficerId=null">
      <div class="officer-card-top">
        <div class="av ${o.status}">${o.name[0]}</div>
        <div><div class="officer-name">${o.name}</div><div class="officer-rank">${o.rank} · ${o.badge}</div></div>
      </div>
      <div class="officer-card-bottom">
        <div class="status-badge">
          <div class="pulse-dot ${o.status}"></div>
          <span style="color:${o.status==='available'?'var(--emerald)':o.status==='assigned'?'var(--electric)':'#64748b'}">${o.status}</span>
        </div>
        <div class="last-seen">${o.lastSeen}</div>
      </div>
      <div class="drag-hint"><i class="fas fa-arrows-up-down-left-right"></i> ${o.status==='available'?'Drag to incident below':'Currently deployed'}</div>
    </div>`).join('');
}

// ── INCIDENT DROP ZONES (Force page) ─────────────────
function renderIncidentDropZones() {
  const container = document.getElementById('forceIncidents');
  if (!container) return;
  const unassigned = incidents.filter(inc => !inc.assignedTo);
  if (!unassigned.length) { container.innerHTML='<p style="color:var(--text-muted);font-size:0.83rem;padding:12px 0">No unassigned incidents — all clear.</p>'; return; }
  container.innerHTML = unassigned.map(inc => `
    <div class="force-inc-card" id="finc-${inc.id}"
      ondragover="event.preventDefault();document.getElementById('finc-${inc.id}').classList.add('drag-over')"
      ondragleave="document.getElementById('finc-${inc.id}').classList.remove('drag-over')"
      ondrop="dropOnIncident(event,${inc.id});document.getElementById('finc-${inc.id}').classList.remove('drag-over')">
      <div class="force-inc-type"><i class="fas fa-circle-exclamation"></i>${inc.type}</div>
      <div class="force-inc-loc"><i class="fas fa-location-dot"></i>${inc.location}</div>
      <div class="force-inc-footer">
        <span class="priority-pill p-${inc.priority.toLowerCase()}">${inc.priority}</span>
        <span class="drop-hint-badge"><i class="fas fa-hand"></i> Drop officer</span>
      </div>
    </div>`).join('');
}

// ── DUTY ROSTER ───────────────────────────────────────
function renderRoster() {
  const roster = document.getElementById('dutyRoster');
  if (!roster) return;
  const active = duties.filter(d => !d.completed);
  if (!active.length) { roster.innerHTML='<p style="color:var(--text-muted);text-align:center;padding:20px">No active duties assigned.</p>'; return; }
  roster.innerHTML = active.slice().reverse().map(d => `
    <div class="roster-item">
      <div>
        <div class="roster-type">${d.type} Duty <span class="priority-pill p-${d.priority.toLowerCase()}" style="margin-left:6px">${d.priority}</span></div>
        <div class="roster-meta">
          <i class="fas fa-location-dot"></i>${d.location}
          <i class="fas fa-user"></i>${d.officerName}
          <i class="fas fa-clock"></i>${d.time}
        </div>
      </div>
      <div class="roster-actions">
        <button class="r-btn complete" onclick="completeDuty(${d.id})" title="Complete"><i class="fas fa-check"></i></button>
        <button class="r-btn edit"     onclick="editDuty(${d.id})"    title="Edit"><i class="fas fa-pen"></i></button>
        <button class="r-btn del"      onclick="deleteDuty(${d.id})"  title="Delete"><i class="fas fa-trash"></i></button>
      </div>
    </div>`).join('');
}

// ── OFFICER DROPDOWN ──────────────────────────────────
function renderDropdown() {
  const dd = document.getElementById('officer');
  if (!dd) return;
  dd.innerHTML = '<option value="">Select Officer</option>' +
    officers.filter(o => o.status==='available').map(o => `<option value="${o.id}">${o.name} (${o.rank})</option>`).join('');
}

// ── STATS ─────────────────────────────────────────────
function updateStats() {
  const active   = duties.filter(d => !d.completed).length;
  const avail    = officers.filter(o => o.status==='available').length;
  const assigned = officers.filter(o => o.status==='assigned').length;
  // Completed Today: only duties completed on today's date
  const todayStr = new Date().toISOString().slice(0, 10);
  const done = duties.filter(d => d.completed && d.completedAt && d.completedAt.startsWith(todayStr)).length;
  ['st-active','sb-active'].forEach(id => { const el=document.getElementById(id); if(el) el.textContent=active; });
  ['st-avail','sb-avail'].forEach(id   => { const el=document.getElementById(id); if(el) el.textContent=avail; });
  const stA=document.getElementById('st-assigned'); if(stA) stA.textContent=assigned;
  const stD=document.getElementById('st-done');     if(stD) stD.textContent=done;
  const sbI=document.getElementById('sb-incidents'); if(sbI) sbI.textContent=incidents.length;
}

// ── FETCH ALL DATA FROM API ───────────────────────────
async function refreshAll() {
  try {
    const [offData, dutyData, incData, alertData] = await Promise.all([
      apiFetch('/api/v1/officers'),
      apiFetch('/api/v1/duties'),  // fetch all duties (completed + active) for stats
      apiFetch('/api/v1/incidents?limit=50'),
      apiFetch('/api/v1/alerts')
    ]);

    officers  = offData.map(o => ({
      ...o,
      mapPos:   o.mapPos || null,
      lastSeen: fmtLastSeen(o.lastSeen)
    }));

    duties = dutyData.map(d => ({
      ...d,
      officerName: d.officerName,
      time:        fmtTime(d.createdAt),
      // Keep raw ISO string for 'Completed Today' date comparison
      completedAt: d.completedAt || null
    }));

    incidents = incData.map(i => ({
      ...i,
      mapPos:     (i.lat && i.lng) ? { lat:i.lat, lng:i.lng } : null,
      assignedTo: i.assignedTo || null,
      time:       fmtTime(i.time)
    }));

    alerts = alertData;
    loadUI();
  } catch(e) {
    toast('API error: ' + e.message, 'error');
  }
}

// ── MAIN LOAD ─────────────────────────────────────────
function loadUI() {
  renderMap();
  renderFeed();
  renderForceGrid();
  renderIncidentDropZones();
  renderRoster();
  renderDropdown();
  updateStats();
}

// ── DUTY ACTIONS ──────────────────────────────────────
document.getElementById('dutyForm').onsubmit = async e => {
  e.preventDefault();
  const oId = parseInt(document.getElementById('officer').value);
  if (!oId) { toast('Select a valid officer','error'); return; }
  const body = {
    type:     document.getElementById('dutyType').value,
    officerId: oId,
    location: document.getElementById('location').value,
    details:  document.getElementById('details').value,
    priority: document.getElementById('priority').value
  };
  try {
    await apiFetch('/api/v1/duties', { method:'POST', body:JSON.stringify(body) });
    e.target.reset(); closeAction();
    await refreshAll();
    toast('Officer deployed successfully!','success');
  } catch(err) { toast(err.message,'error'); }
};

async function completeDuty(id) {
  try {
    await apiFetch(`/api/v1/duties/${id}/complete`, { method:'PATCH' });
    await refreshAll();
    toast('Duty completed. Officer back on standby.','success');
  } catch(e) { toast(e.message,'error'); }
}

async function deleteDuty(id) {
  try {
    await apiFetch(`/api/v1/duties/${id}`, { method:'DELETE' });
    await refreshAll();
    toast('Assignment removed.','error');
  } catch(e) { toast(e.message,'error'); }
}

function editDuty(id) {
  const d = duties.find(x => x.id===id); if (!d) return;
  document.getElementById('editId').value  = id;
  document.getElementById('editType').value = d.type;
  document.getElementById('editLoc').value  = d.location;
  document.getElementById('editPri').value  = d.priority;
  openModal();
}

document.getElementById('editDutyForm').onsubmit = async e => {
  e.preventDefault();
  const id   = parseInt(document.getElementById('editId').value);
  const body = {
    type:     document.getElementById('editType').value,
    location: document.getElementById('editLoc').value,
    priority: document.getElementById('editPri').value
  };
  try {
    await apiFetch(`/api/v1/duties/${id}`, { method:'PATCH', body:JSON.stringify(body) });
    closeModal(); await refreshAll(); toast('Assignment updated.','info');
  } catch(err) { toast(err.message,'error'); }
};

// ── WEBSOCKET (real-time updates) ─────────────────────
let ws = null;
function connectWS() {
  ws = new WebSocket(WS_URL);
  ws.onopen = () => console.log('[WS] Connected');
  ws.onclose = () => { setTimeout(connectWS, 3000); };
  ws.onerror = () => ws.close();

  ws.onmessage = async evt => {
    let msg;
    try { msg = JSON.parse(evt.data); } catch { return; }
    const { event, data } = msg;

    if (event === 'officer:status_changed') {
      const o = officers.find(x => x.id===data.officerId);
      if (o) { o.status=data.status; o.lastSeen=fmtLastSeen(data.lastSeen); loadUI(); }

    } else if (event === 'duty:created' || event === 'duty:completed' || event === 'duty:deleted'
            || event === 'incident:new'  || event === 'incident:assigned' || event === 'incident:resolved') {
      await refreshAll();

    } else if (event === 'heartbeat') {
      ws.send(JSON.stringify({ event:'ping' }));
    }
  };
}

// ── LOGOUT ────────────────────────────────────────────
function logout() {
  localStorage.clear();
  window.location.replace('login.html');
}

// ── SHOW LOGGED-IN USER ───────────────────────────────
(function showUser() {
  const user = localStorage.getItem('pt_user') || '';
  const role = getRole();
  const el   = document.getElementById('userInfo');
  if (el) el.textContent = user + ' (' + role + ')';
})();

// ── INIT ──────────────────────────────────────────────
refreshAll().then(connectWS);
