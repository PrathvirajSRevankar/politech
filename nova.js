// ══════════════════════════════════════════════════════
// NOVA — Network Operations Virtual Assistant
// Agentic AI Command Assistant for POLITECH
// ══════════════════════════════════════════════════════

const NOVA_API = 'https://politech.onrender.com';

// ── State ─────────────────────────────────────────────
let novaOpen = false;
let novaMessages = [];
let novaProcessing = false;

// ── Auth helpers ──────────────────────────────────────
function novaToken() { return localStorage.getItem('pt_token') || ''; }
function novaRole()  { return localStorage.getItem('pt_role')  || ''; }
function novaUser()  { return localStorage.getItem('pt_user')  || ''; }
function novaHeaders() {
  return { 'Authorization': 'Bearer ' + novaToken(), 'Content-Type': 'application/json' };
}

// ── API fetch wrapper ─────────────────────────────────
async function novaFetch(path, opts = {}) {
  const res = await fetch(NOVA_API + path, { ...opts, headers: { ...novaHeaders(), ...(opts.headers || {}) } });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || res.statusText);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ── Tool definitions ──────────────────────────────────
const NOVA_TOOLS = {
  get_officers:       { method: 'GET', path: '/api/v1/officers', roles: ['admin','dispatcher','officer','analyst'] },
  get_incidents:      { method: 'GET', path: '/api/v1/incidents', roles: ['admin','dispatcher','officer','analyst'] },
  get_duties:         { method: 'GET', path: '/api/v1/duties', roles: ['admin','dispatcher','officer','analyst'] },
  get_alerts:         { method: 'GET', path: '/api/v1/alerts', roles: ['admin','dispatcher','officer','analyst'] },
  get_analytics_kpi:  { method: 'GET', path: '/api/v1/analytics/kpi', roles: ['admin','dispatcher','analyst','officer'] },
  get_officer_performance: { method: 'GET', path: '/api/v1/analytics/officer-performance', roles: ['admin','dispatcher','analyst','officer'] },
  get_priority_distribution: { method: 'GET', path: '/api/v1/analytics/priority-distribution', roles: ['admin','dispatcher','analyst','officer'] },
  assign_officer:     { method: 'PATCH', pathFn: (p) => `/api/v1/incidents/${p.incident_id}/assign`, roles: ['admin','dispatcher'] },
  create_duty:        { method: 'POST', path: '/api/v1/duties', roles: ['admin','dispatcher'] },
  complete_duty:      { method: 'PATCH', pathFn: (p) => `/api/v1/duties/${p.duty_id}/complete`, roles: ['admin','dispatcher'] },
  resolve_incident:   { method: 'PATCH', pathFn: (p) => `/api/v1/incidents/${p.incident_id}/resolve`, roles: ['admin','dispatcher'] },
};

// ── Haversine distance (km) ───────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── Call a tool ───────────────────────────────────────
async function novaCallTool(toolName, params = {}) {
  const tool = NOVA_TOOLS[toolName];
  if (!tool) return { error: `Unknown tool: ${toolName}` };
  if (!tool.roles.includes(novaRole())) {
    return { error: `Your role (${novaRole()}) does not permit this action.` };
  }
  try {
    const path = tool.pathFn ? tool.pathFn(params) : tool.path;
    const opts = { method: tool.method };
    if (tool.method === 'POST' || (tool.method === 'PATCH' && params.body)) {
      opts.body = JSON.stringify(params.body || {});
    } else if (tool.method === 'PATCH' && toolName === 'assign_officer') {
      opts.body = JSON.stringify({ officerId: params.officer_id });
    }
    return await novaFetch(path, opts);
  } catch (e) {
    return { error: e.message };
  }
}

// ── Intent parser ─────────────────────────────────────
function parseIntent(msg) {
  const m = msg.toLowerCase().trim();

  // Situation / overview
  if (/current situation|status update|overview|what.?s happening|sitrep|briefing/i.test(m)) return 'situation';

  // Officers
  if (/who.?s available|available officer|officer.?s? available|free officer/i.test(m)) return 'available_officers';
  if (/off.?duty|who.?s off/i.test(m)) return 'offduty_officers';
  if (/officer|personnel|force status|headcount/i.test(m)) return 'all_officers';

  // Incidents
  if (/unassigned|pending incident|open incident|unresolved/i.test(m)) return 'unassigned_incidents';
  if (/critical.*incident|incident.*critical/i.test(m)) return 'critical_incidents';
  if (/incident/i.test(m)) return 'all_incidents';

  // Assign
  if (/assign.*officer|deploy.*officer|send.*officer|assign.*nearest/i.test(m)) return 'assign';

  // Duties
  if (/active dut|duty roster|current dut/i.test(m)) return 'active_duties';
  if (/complete.*duty|finish.*duty|mark.*complete/i.test(m)) return 'complete_duty';
  if (/dut/i.test(m)) return 'all_duties';

  // Analytics
  if (/performance|top officer|best officer|leaderboard/i.test(m)) return 'performance';
  if (/kpi|metric|stats today/i.test(m)) return 'kpi';
  if (/priority.*distribution|threat level|severity/i.test(m)) return 'priority_dist';

  // Alerts
  if (/alert|notification|warning/i.test(m)) return 'alerts';

  // Resolve
  if (/resolve.*incident|close.*incident/i.test(m)) return 'resolve';

  // Help
  if (/help|what can you|command/i.test(m)) return 'help';

  return 'unknown';
}

// ── Extract IDs from message ──────────────────────────
function extractId(msg) {
  const match = msg.match(/\b(\d+)\b/);
  return match ? parseInt(match[1]) : null;
}

// ── Format helpers ────────────────────────────────────
function fmtTable(headers, rows) {
  let html = '<table class="nova-table"><thead><tr>';
  headers.forEach(h => html += `<th>${h}</th>`);
  html += '</tr></thead><tbody>';
  rows.forEach(r => {
    html += '<tr>';
    r.forEach(c => html += `<td>${c}</td>`);
    html += '</tr>';
  });
  html += '</tbody></table>';
  return html;
}

function statusDot(s) {
  const colors = { available: '#10b981', assigned: '#3b82f6', 'off-duty': '#64748b' };
  return `<span style="color:${colors[s]||'#94a3b8'}">● ${s}</span>`;
}

function priorityBadge(p) {
  const colors = { Critical:'#ef4444', High:'#f59e0b', Medium:'#3b82f6', Low:'#10b981' };
  return `<span style="color:${colors[p]||'#94a3b8'};font-weight:700">${p}</span>`;
}

// ── Main response engine ──────────────────────────────
async function novaRespond(userMsg) {
  const intent = parseIntent(userMsg);
  let reply = '';

  try {
    switch (intent) {

      case 'situation': {
        const [off, inc, kpi] = await Promise.all([
          novaCallTool('get_officers'),
          novaCallTool('get_incidents'),
          novaCallTool('get_analytics_kpi')
        ]);
        if (off.error || inc.error) return `⚠️ API Error: ${off.error || inc.error}`;
        const avail = off.filter(o => o.status === 'available').length;
        const assigned = off.filter(o => o.status === 'assigned').length;
        const offduty = off.filter(o => o.status === 'off-duty').length;
        const criticals = inc.filter(i => i.priority === 'Critical' && !i.assignedTo);
        reply = `<strong>📡 OPERATIONAL SNAPSHOT</strong><br><br>`;
        reply += `<strong>Force:</strong> ${avail} available · ${assigned} deployed · ${offduty} off-duty<br>`;
        reply += `<strong>Incidents:</strong> ${inc.length} active · ${inc.filter(i=>!i.assignedTo).length} unassigned<br>`;
        if (kpi && !kpi.error) {
          reply += `<strong>KPIs:</strong> ${kpi.totalIncidentsMTD} incidents MTD · Avg response ${kpi.avgResponseTimeMin} min · ${kpi.dutyCompletionRate}% duty completion<br>`;
        }
        if (criticals.length > 0) {
          reply += `<br>⚠️ <strong>CRITICAL ALERT:</strong> ${criticals.length} unassigned critical incident(s)!`;
          criticals.forEach(c => { reply += `<br>→ ${c.type} at ${c.location} (ID: ${c.id})`; });
        }
        if (avail < 2) reply += `<br>🔴 <strong>LOW STAFFING:</strong> Only ${avail} officer(s) available.`;
        break;
      }

      case 'available_officers': {
        const off = await novaCallTool('get_officers');
        if (off.error) return `⚠️ ${off.error}`;
        const avail = off.filter(o => o.status === 'available');
        if (!avail.length) return 'No officers currently available.';
        reply = `<strong>✅ ${avail.length} Officer(s) Available</strong><br><br>`;
        reply += fmtTable(['Name','Rank','Badge','Last Seen'], avail.map(o => [o.name, o.rank, o.badge, o.lastSeen || '—']));
        break;
      }

      case 'offduty_officers': {
        const off = await novaCallTool('get_officers');
        if (off.error) return `⚠️ ${off.error}`;
        const od = off.filter(o => o.status === 'off-duty');
        if (!od.length) return 'No officers are currently off-duty. Full force is active.';
        reply = `<strong>😴 ${od.length} Officer(s) Off-Duty</strong><br><br>`;
        reply += fmtTable(['Name','Rank','Last Seen'], od.map(o => [o.name, o.rank, o.lastSeen || '—']));
        break;
      }

      case 'all_officers': {
        const off = await novaCallTool('get_officers');
        if (off.error) return `⚠️ ${off.error}`;
        reply = `<strong>👮 Force Roster — ${off.length} Officers</strong><br><br>`;
        reply += fmtTable(['Name','Rank','Status'], off.map(o => [o.name, o.rank, statusDot(o.status)]));
        break;
      }

      case 'unassigned_incidents': {
        const inc = await novaCallTool('get_incidents');
        if (inc.error) return `⚠️ ${inc.error}`;
        const ua = inc.filter(i => !i.assignedTo);
        if (!ua.length) return '✅ All incidents are currently assigned. No pending calls.';
        reply = `<strong>🔔 ${ua.length} Unassigned Incident(s)</strong><br><br>`;
        reply += fmtTable(['ID','Type','Location','Priority'], ua.map(i => [i.id, i.type, i.location, priorityBadge(i.priority)]));
        break;
      }

      case 'critical_incidents': {
        const inc = await novaCallTool('get_incidents');
        if (inc.error) return `⚠️ ${inc.error}`;
        const cr = inc.filter(i => i.priority === 'Critical');
        if (!cr.length) return '✅ No critical incidents at this time.';
        reply = `<strong>🔴 ${cr.length} Critical Incident(s)</strong><br><br>`;
        reply += fmtTable(['ID','Type','Location','Assigned'], cr.map(i => [i.id, i.type, i.location, i.assignedTo || '❌ Unassigned']));
        break;
      }

      case 'all_incidents': {
        const inc = await novaCallTool('get_incidents');
        if (inc.error) return `⚠️ ${inc.error}`;
        if (!inc.length) return '✅ No active incidents.';
        reply = `<strong>📋 ${inc.length} Active Incident(s)</strong><br><br>`;
        reply += fmtTable(['ID','Type','Priority','Assigned'], inc.slice(0,10).map(i => [i.id, i.type, priorityBadge(i.priority), i.assignedTo || '—']));
        if (inc.length > 10) reply += `<br><em>Showing 10 of ${inc.length}</em>`;
        break;
      }

      case 'assign': {
        const incId = extractId(userMsg);
        if (!incId) return 'Please specify an incident ID. Example: <em>"Assign nearest officer to incident 7"</em>';
        const [inc, off] = await Promise.all([novaCallTool('get_incidents'), novaCallTool('get_officers')]);
        if (inc.error || off.error) return `⚠️ ${inc.error || off.error}`;
        const incident = (Array.isArray(inc) ? inc : []).find(i => i.id === incId);
        if (!incident) return `❌ Incident #${incId} not found or already resolved.`;
        if (incident.assignedTo) return `ℹ️ Incident #${incId} is already assigned to ${incident.assignedTo}.`;
        const avail = off.filter(o => o.status === 'available');
        if (!avail.length) return '🔴 No available officers to assign.';
        let best = avail[0], bestDist = Infinity;
        if (incident.lat && incident.lng) {
          avail.forEach(o => {
            if (o.lat && o.lng) {
              const d = haversine(o.lat, o.lng, incident.lat, incident.lng);
              if (d < bestDist) { bestDist = d; best = o; }
            }
          });
        }
        const distStr = bestDist < Infinity ? ` — ${bestDist.toFixed(1)} km away` : '';
        // Store pending action
        window._novaPending = { action: 'assign', incidentId: incId, officerId: best.id, officerName: best.name };
        reply = `<strong>📍 Assignment Recommendation</strong><br><br>`;
        reply += `Incident: <strong>${incident.type}</strong> at ${incident.location} (${priorityBadge(incident.priority)})<br>`;
        reply += `Recommended: <strong>${best.name}</strong> (${best.rank}, Badge ${best.badge})${distStr}<br><br>`;
        reply += `<strong>Shall I proceed with the assignment?</strong> <em>(yes/no)</em>`;
        break;
      }

      case 'active_duties': {
        const dut = await novaCallTool('get_duties');
        if (dut.error) return `⚠️ ${dut.error}`;
        const active = dut.filter(d => !d.completed);
        if (!active.length) return 'No active duties at this time.';
        reply = `<strong>📋 ${active.length} Active Duties</strong><br><br>`;
        reply += fmtTable(['ID','Type','Officer','Location','Priority'], active.map(d => [d.id, d.type, d.officerName, d.location, priorityBadge(d.priority)]));
        break;
      }

      case 'all_duties': {
        const dut = await novaCallTool('get_duties');
        if (dut.error) return `⚠️ ${dut.error}`;
        reply = `<strong>📋 ${dut.length} Total Duties</strong><br><br>`;
        const rows = dut.slice(0,10).map(d => [d.id, d.type, d.officerName || '—', d.completed ? '✅' : '🔄']);
        reply += fmtTable(['ID','Type','Officer','Status'], rows);
        break;
      }

      case 'performance': {
        const perf = await novaCallTool('get_officer_performance');
        if (perf.error) return `⚠️ ${perf.error}`;
        if (!perf.length) return 'No performance data available yet.';
        reply = `<strong>🏆 Officer Performance Leaderboard</strong><br><br>`;
        reply += fmtTable(['#','Name','Duties Done','Avg RT','Rating'], perf.slice(0,5).map(p => [p.rank, p.name, p.dutiesCompleted, p.avgResponseMin ? p.avgResponseMin+'m' : '—', p.rating+'%']));
        break;
      }

      case 'kpi': {
        const kpi = await novaCallTool('get_analytics_kpi');
        if (kpi.error) return `⚠️ ${kpi.error}`;
        reply = `<strong>📊 KPI Dashboard</strong><br><br>`;
        reply += `• <strong>Incidents MTD:</strong> ${kpi.totalIncidentsMTD} (${kpi.totalIncidentsMTDTrend > 0 ? '↑' : '↓'}${Math.abs(kpi.totalIncidentsMTDTrend)}%)<br>`;
        reply += `• <strong>Avg Response Time:</strong> ${kpi.avgResponseTimeMin} min ${kpi.avgResponseTimeMin <= 10 ? '✅ within target' : '⚠️ above 10-min target'}<br>`;
        reply += `• <strong>Critical Today:</strong> ${kpi.criticalIncidentsToday}<br>`;
        reply += `• <strong>Duty Completion:</strong> ${kpi.dutyCompletionRate}%`;
        break;
      }

      case 'priority_dist': {
        const pd = await novaCallTool('get_priority_distribution');
        if (pd.error) return `⚠️ ${pd.error}`;
        reply = `<strong>📊 Priority Distribution</strong> (${pd.total} total)<br><br>`;
        pd.distribution.forEach(d => {
          const bar = '█'.repeat(Math.round(d.percent / 5)) + '░'.repeat(20 - Math.round(d.percent / 5));
          reply += `${priorityBadge(d.priority)}: ${bar} ${d.percent}% (${d.count})<br>`;
        });
        break;
      }

      case 'alerts': {
        const al = await novaCallTool('get_alerts');
        if (al.error) return `⚠️ ${al.error}`;
        if (!al.length) return '✅ No active alerts.';
        reply = `<strong>🔔 ${al.length} Active Alert(s)</strong><br><br>`;
        al.slice(0,5).forEach(a => {
          reply += `<strong>${a.title}</strong><br><span style="color:var(--text-muted)">${a.description || a.desc || ''}</span><br><br>`;
        });
        break;
      }

      case 'resolve': {
        const incId = extractId(userMsg);
        if (!incId) return 'Please specify an incident ID. Example: <em>"Resolve incident 5"</em>';
        window._novaPending = { action: 'resolve', incidentId: incId };
        reply = `Ready to resolve incident #${incId}. <strong>Confirm?</strong> <em>(yes/no)</em>`;
        break;
      }

      case 'complete_duty': {
        const dutyId = extractId(userMsg);
        if (!dutyId) return 'Please specify a duty ID. Example: <em>"Complete duty 3"</em>';
        window._novaPending = { action: 'complete_duty', dutyId: dutyId };
        reply = `Ready to mark duty #${dutyId} as complete. <strong>Confirm?</strong> <em>(yes/no)</em>`;
        break;
      }

      case 'help':
        reply = `<strong>🤖 NOVA Commands</strong><br><br>`;
        reply += `<strong>Queries:</strong><br>`;
        reply += `• "What's the current situation?"<br>• "Who's available?"<br>• "Show unassigned incidents"<br>• "Show critical incidents"<br>• "Active duties"<br>• "What alerts are active?"<br><br>`;
        reply += `<strong>Analytics:</strong><br>`;
        reply += `• "Give me today's KPIs"<br>• "Officer performance"<br>• "Priority distribution"<br><br>`;
        reply += `<strong>Actions:</strong><br>`;
        reply += `• "Assign nearest officer to incident 7"<br>• "Resolve incident 5"<br>• "Complete duty 3"`;
        break;

      default: {
        // Check for pending confirmation
        if (window._novaPending && /^(yes|y|confirm|go|proceed|execute|do it|affirmative)/i.test(userMsg.trim())) {
          const p = window._novaPending;
          window._novaPending = null;
          if (p.action === 'assign') {
            const result = await novaCallTool('assign_officer', { incident_id: p.incidentId, officer_id: p.officerId });
            if (result && !result.error) {
              reply = `✅ <strong>${p.officerName}</strong> assigned to incident #${p.incidentId}.<br>Emergency duty auto-created. Clients notified via WebSocket.`;
              if (typeof refreshAll === 'function') refreshAll();
            } else {
              reply = `❌ Assignment failed: ${result?.error || 'Unknown error'}`;
            }
          } else if (p.action === 'resolve') {
            const result = await novaCallTool('resolve_incident', { incident_id: p.incidentId });
            if (result && !result.error) {
              reply = `✅ Incident #${p.incidentId} resolved.`;
              if (typeof refreshAll === 'function') refreshAll();
            } else {
              reply = `❌ Failed: ${result?.error || 'Unknown error'}`;
            }
          } else if (p.action === 'complete_duty') {
            const result = await novaCallTool('complete_duty', { duty_id: p.dutyId });
            if (result && !result.error) {
              reply = `✅ Duty #${p.dutyId} marked complete. Officer released.`;
              if (typeof refreshAll === 'function') refreshAll();
            } else {
              reply = `❌ Failed: ${result?.error || 'Unknown error'}`;
            }
          }
          break;
        }
        if (window._novaPending && /^(no|n|cancel|abort|negative)/i.test(userMsg.trim())) {
          window._novaPending = null;
          reply = 'Action cancelled.';
          break;
        }
        reply = `I'm not sure how to handle that. Type <strong>"help"</strong> to see available commands.`;
      }
    }
  } catch (e) {
    reply = `⚠️ Error: ${e.message}. Please refresh the dashboard.`;
  }
  return reply;
}

// ── UI Rendering ──────────────────────────────────────
function toggleNova() {
  novaOpen = !novaOpen;
  document.getElementById('novaPanel').classList.toggle('open', novaOpen);
  document.getElementById('novaFab').classList.toggle('active', novaOpen);
  if (novaOpen && novaMessages.length === 0) {
    addNovaMessage('nova', `<strong>NOVA Online</strong> — ${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}<br><br>Hello, <strong>${novaUser() || 'Operator'}</strong> (${novaRole()}). I'm your command assistant.<br>Type <strong>"help"</strong> for available commands or ask me anything about operations.`);
  }
}

function addNovaMessage(role, content) {
  novaMessages.push({ role, content, time: new Date() });
  renderNovaMessages();
}

function renderNovaMessages() {
  const container = document.getElementById('novaMessages');
  container.innerHTML = novaMessages.map(m => {
    const isNova = m.role === 'nova';
    return `<div class="nova-msg ${isNova ? 'nova-bot' : 'nova-user'}">
      ${isNova ? '<div class="nova-avatar"><i class="fas fa-robot"></i></div>' : ''}
      <div class="nova-bubble ${isNova ? 'bot' : 'user'}">${m.content}</div>
    </div>`;
  }).join('');
  container.scrollTop = container.scrollHeight;
}

async function sendNovaMessage() {
  const input = document.getElementById('novaInput');
  const msg = input.value.trim();
  if (!msg || novaProcessing) return;
  input.value = '';
  addNovaMessage('user', msg);
  novaProcessing = true;
  document.getElementById('novaTyping').style.display = 'flex';
  const reply = await novaRespond(msg);
  document.getElementById('novaTyping').style.display = 'none';
  novaProcessing = false;
  addNovaMessage('nova', reply);
}

// Enter key handler
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('novaInput');
  if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') sendNovaMessage(); });
});
