// ══════════════════════════════════════════════════════
// NOVA — Network Operations Virtual Assistant v2
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
    throw new Error(err.detail || `${res.status} ${res.statusText}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ── Haversine distance (km) ───────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── Format helpers ────────────────────────────────────
function fmtTable(headers, rows) {
  if (!rows.length) return '<em>No records found.</em>';
  let html = '<table class="nova-table"><thead><tr>';
  headers.forEach(h => html += `<th>${h}</th>`);
  html += '</tr></thead><tbody>';
  rows.forEach(r => {
    html += '<tr>';
    r.forEach(c => html += `<td>${c ?? '—'}</td>`);
    html += '</tr>';
  });
  html += '</tbody></table>';
  return html;
}

function statusDot(s) {
  const colors = { available: '#10b981', assigned: '#3b82f6', 'off-duty': '#64748b', offduty: '#64748b' };
  return `<span style="color:${colors[s]||'#94a3b8'}">● ${s}</span>`;
}

function priorityBadge(p) {
  const colors = { Critical:'#ef4444', High:'#f59e0b', Medium:'#3b82f6', Low:'#10b981' };
  return `<span style="color:${colors[p]||'#94a3b8'};font-weight:700">${p||'—'}</span>`;
}

// ── Extract first number from message ─────────────────
function extractId(msg) {
  const match = msg.match(/\b(\d+)\b/);
  return match ? parseInt(match[1]) : null;
}

// ── Intent Parser — flexible NL matching ─────────────
function parseIntent(msg) {
  const m = msg.toLowerCase().trim();

  // Confirmation / cancellation (check first)
  if (/^(yes|y|confirm|go ahead|proceed|execute|do it|affirmative|sure|ok|okay|yep|yup)$/i.test(m)) return 'confirm';
  if (/^(no|n|cancel|abort|stop|negative|nope|nah)$/i.test(m)) return 'cancel';

  // Situation / overview
  if (/situation|status|overview|happening|sitrep|briefing|summary|update|snapshot|report/i.test(m)) return 'situation';

  // Assign
  if (/assign|deploy|send|dispatch|nearest.*officer|officer.*nearest/i.test(m)) return 'assign';

  // Resolve incident
  if (/resolv|close.*incident|incident.*close|mark.*resolve|finish.*incident/i.test(m)) return 'resolve';

  // Complete duty
  if (/complet.*duty|duty.*complet|finish.*duty|duty.*finish|mark.*duty|done.*duty|duty.*done/i.test(m)) return 'complete_duty';

  // Officers — specific filters first
  if (/avail/i.test(m) && /officer|who|personnel|force/i.test(m)) return 'available_officers';
  if (/avail/i.test(m)) return 'available_officers';
  if (/off.?dut|who.?s off|not on dut/i.test(m)) return 'offduty_officers';
  if (/officer|personnel|force|roster|headcount|staff/i.test(m)) return 'all_officers';

  // Incidents — specific filters first
  if (/unassign|pending|open|no.*officer|not assign/i.test(m) && /incident|call|case/i.test(m)) return 'unassigned_incidents';
  if (/unassign|pending|open incident/i.test(m)) return 'unassigned_incidents';
  if (/critical|urgent|emergency|high.?prior/i.test(m) && /incident|call|case/i.test(m)) return 'critical_incidents';
  if (/incident|call|case|crime/i.test(m)) return 'all_incidents';

  // Duties
  if (/active dut|current dut|ongoing dut/i.test(m)) return 'active_duties';
  if (/dut/i.test(m)) return 'all_duties';

  // Analytics
  if (/top officer|best officer|leaderboard|rank|who.*perform|perform/i.test(m)) return 'performance';
  if (/kpi|metric|stat|number|today.*num|how many/i.test(m)) return 'kpi';
  if (/priority|distribution|threat|severity|breakdown/i.test(m)) return 'priority_dist';

  // Alerts
  if (/alert|notification|warning|alarm/i.test(m)) return 'alerts';

  // Help
  if (/help|what can|command|how to|what do|guide|usage/i.test(m)) return 'help';

  return 'unknown';
}

// ── Main response engine ──────────────────────────────
async function novaRespond(userMsg) {
  const intent = parseIntent(userMsg);
  let reply = '';

  try {
    // ── Handle pending confirmation first ─────────────
    if (intent === 'confirm' && window._novaPending) {
      const p = window._novaPending;
      window._novaPending = null;

      if (p.action === 'assign') {
        const result = await novaFetch(`/api/v1/incidents/${p.incidentId}/assign`, {
          method: 'PATCH',
          body: JSON.stringify({ officerId: p.officerId }),
        });
        if (result) {
          reply = `✅ <strong>${p.officerName}</strong> has been assigned to incident #${p.incidentId}.<br>Emergency duty auto-created. Dashboard updated.`;
          if (typeof refreshAll === 'function') refreshAll();
        }
      } else if (p.action === 'resolve') {
        await novaFetch(`/api/v1/incidents/${p.incidentId}/resolve`, { method: 'PATCH' });
        reply = `✅ Incident #${p.incidentId} has been resolved and closed.`;
        if (typeof refreshAll === 'function') refreshAll();
      } else if (p.action === 'complete_duty') {
        await novaFetch(`/api/v1/duties/${p.dutyId}/complete`, { method: 'PATCH' });
        reply = `✅ Duty #${p.dutyId} marked complete. Officer is now available.`;
        if (typeof refreshAll === 'function') refreshAll();
      }
      return reply || '✅ Action completed.';
    }

    if (intent === 'cancel') {
      window._novaPending = null;
      return 'Action cancelled.';
    }

    // ── Intents ───────────────────────────────────────
    switch (intent) {

      case 'situation': {
        const [off, inc, kpi] = await Promise.all([
          novaFetch('/api/v1/officers'),
          novaFetch('/api/v1/incidents'),
          novaFetch('/api/v1/analytics/kpi'),
        ]);
        const avail = off.filter(o => o.status === 'available').length;
        const assigned = off.filter(o => o.status === 'assigned').length;
        const offduty = off.filter(o => o.status === 'off-duty' || o.status === 'offduty').length;
        const activeInc = inc.filter(i => !i.resolvedAt);
        const unassigned = activeInc.filter(i => !i.assignedTo);
        const criticals = unassigned.filter(i => i.priority === 'Critical');

        reply = `<strong>📡 OPERATIONAL SNAPSHOT</strong><br><br>`;
        reply += `<strong>Force:</strong> ${avail} available · ${assigned} deployed · ${offduty} off-duty<br>`;
        reply += `<strong>Incidents:</strong> ${activeInc.length} active · ${unassigned.length} unassigned<br>`;
        if (kpi) {
          reply += `<strong>KPIs:</strong> ${kpi.totalIncidentsMTD} incidents MTD · Avg response ${kpi.avgResponseTimeMin} min · ${kpi.dutyCompletionRate}% duty completion<br>`;
        }
        if (criticals.length > 0) {
          reply += `<br>⚠️ <strong>CRITICAL ALERT:</strong> ${criticals.length} unassigned critical incident(s)!`;
          criticals.slice(0, 3).forEach(c => { reply += `<br>→ ${c.type} at ${c.location} (ID: ${c.id})`; });
        }
        if (avail < 2) reply += `<br>🔴 <strong>LOW STAFFING:</strong> Only ${avail} officer(s) available.`;
        break;
      }

      case 'available_officers': {
        const off = await novaFetch('/api/v1/officers');
        const avail = off.filter(o => o.status === 'available');
        if (!avail.length) return '🔴 No officers currently available. All are deployed or off-duty.';
        reply = `<strong>✅ ${avail.length} Officer(s) Available</strong><br><br>`;
        reply += fmtTable(['Name', 'Rank', 'Badge'], avail.map(o => [o.name, o.rank, o.badge]));
        break;
      }

      case 'offduty_officers': {
        const off = await novaFetch('/api/v1/officers');
        const od = off.filter(o => o.status === 'off-duty' || o.status === 'offduty');
        if (!od.length) return '✅ No officers are off-duty. Full force is active.';
        reply = `<strong>😴 ${od.length} Officer(s) Off-Duty</strong><br><br>`;
        reply += fmtTable(['Name', 'Rank'], od.map(o => [o.name, o.rank]));
        break;
      }

      case 'all_officers': {
        const off = await novaFetch('/api/v1/officers');
        reply = `<strong>👮 Force Roster — ${off.length} Officers</strong><br><br>`;
        reply += fmtTable(['Name', 'Rank', 'Status'], off.map(o => [o.name, o.rank, statusDot(o.status)]));
        break;
      }

      case 'unassigned_incidents': {
        const inc = await novaFetch('/api/v1/incidents?assigned=false');
        const active = inc.filter(i => !i.resolvedAt);
        if (!active.length) return '✅ All incidents are currently assigned. No pending calls.';
        reply = `<strong>🔔 ${active.length} Unassigned Incident(s)</strong><br><br>`;
        reply += fmtTable(['ID', 'Type', 'Location', 'Priority'],
          active.map(i => [i.id, i.type, i.location, priorityBadge(i.priority)]));
        break;
      }

      case 'critical_incidents': {
        const inc = await novaFetch('/api/v1/incidents?priority=Critical');
        const active = inc.filter(i => !i.resolvedAt);
        if (!active.length) return '✅ No critical incidents at this time.';
        reply = `<strong>🔴 ${active.length} Critical Incident(s)</strong><br><br>`;
        reply += fmtTable(['ID', 'Type', 'Location', 'Assigned'],
          active.map(i => [i.id, i.type, i.location, i.assignedTo || '❌ Unassigned']));
        break;
      }

      case 'all_incidents': {
        const inc = await novaFetch('/api/v1/incidents');
        const active = inc.filter(i => !i.resolvedAt);
        if (!active.length) return '✅ No active incidents.';
        reply = `<strong>📋 ${active.length} Active Incident(s)</strong><br><br>`;
        reply += fmtTable(['ID', 'Type', 'Priority', 'Assigned'],
          active.slice(0, 10).map(i => [i.id, i.type, priorityBadge(i.priority), i.assignedTo || '—']));
        if (active.length > 10) reply += `<br><em>Showing 10 of ${active.length}</em>`;
        break;
      }

      case 'assign': {
        const incId = extractId(userMsg);
        if (!incId) return 'Please specify an incident ID. Example: <em>"Assign nearest officer to incident 7"</em>';

        const [inc, off] = await Promise.all([
          novaFetch('/api/v1/incidents'),
          novaFetch('/api/v1/officers'),
        ]);
        const incident = inc.find(i => i.id === incId);
        if (!incident) return `❌ Incident #${incId} not found.`;
        if (incident.resolvedAt) return `ℹ️ Incident #${incId} is already resolved.`;
        if (incident.assignedTo) return `ℹ️ Incident #${incId} is already assigned to <strong>${incident.assignedTo}</strong>.`;

        const avail = off.filter(o => o.status === 'available');
        if (!avail.length) return '🔴 No available officers to assign. All are deployed.';

        // Find nearest officer (or first available if no coordinates)
        let best = avail[0], bestDist = Infinity;
        if (incident.mapPos?.lat && incident.mapPos?.lng) {
          avail.forEach(o => {
            if (o.mapPos?.lat && o.mapPos?.lng) {
              const d = haversine(o.mapPos.lat, o.mapPos.lng, incident.mapPos.lat, incident.mapPos.lng);
              if (d < bestDist) { bestDist = d; best = o; }
            }
          });
        } else if (incident.lat && incident.lng) {
          avail.forEach(o => {
            if (o.lat && o.lng) {
              const d = haversine(o.lat, o.lng, incident.lat, incident.lng);
              if (d < bestDist) { bestDist = d; best = o; }
            }
          });
        }

        const distStr = bestDist < Infinity ? ` — ${bestDist.toFixed(1)} km away` : '';
        window._novaPending = { action: 'assign', incidentId: incId, officerId: best.id, officerName: best.name };

        reply = `<strong>📍 Assignment Recommendation</strong><br><br>`;
        reply += `Incident <strong>#${incId}</strong>: ${incident.type} at ${incident.location} (${priorityBadge(incident.priority)})<br>`;
        reply += `Best match: <strong>${best.name}</strong> (${best.rank}, Badge ${best.badge})${distStr}<br><br>`;
        reply += `<strong>Confirm assignment?</strong> <em>(yes / no)</em>`;
        break;
      }

      case 'resolve': {
        const incId = extractId(userMsg);
        if (!incId) return 'Please specify an incident ID. Example: <em>"Resolve incident 5"</em>';
        window._novaPending = { action: 'resolve', incidentId: incId };
        reply = `Ready to resolve incident <strong>#${incId}</strong>.<br><strong>Confirm?</strong> <em>(yes / no)</em>`;
        break;
      }

      case 'complete_duty': {
        const dutyId = extractId(userMsg);
        if (!dutyId) return 'Please specify a duty ID. Example: <em>"Complete duty 3"</em>';
        window._novaPending = { action: 'complete_duty', dutyId: dutyId };
        reply = `Ready to mark duty <strong>#${dutyId}</strong> as complete.<br><strong>Confirm?</strong> <em>(yes / no)</em>`;
        break;
      }

      case 'active_duties': {
        const dut = await novaFetch('/api/v1/duties?completed=false');
        if (!dut.length) return '✅ No active duties right now.';
        reply = `<strong>📋 ${dut.length} Active Duties</strong><br><br>`;
        reply += fmtTable(['ID', 'Type', 'Officer', 'Location', 'Priority'],
          dut.map(d => [d.id, d.type, d.officerName, d.location, priorityBadge(d.priority)]));
        break;
      }

      case 'all_duties': {
        const dut = await novaFetch('/api/v1/duties');
        reply = `<strong>📋 ${dut.length} Total Duties</strong><br><br>`;
        reply += fmtTable(['ID', 'Type', 'Officer', 'Status'],
          dut.slice(0, 10).map(d => [d.id, d.type, d.officerName, d.completed ? '✅ Done' : '🔄 Active']));
        if (dut.length > 10) reply += `<br><em>Showing 10 of ${dut.length}</em>`;
        break;
      }

      case 'performance': {
        const perf = await novaFetch('/api/v1/analytics/officer-performance');
        if (!perf.length) return 'No performance data available yet.';
        reply = `<strong>🏆 Officer Performance Leaderboard</strong><br><br>`;
        reply += fmtTable(['#', 'Name', 'Duties Done', 'Avg RT', 'Rating'],
          perf.slice(0, 8).map(p => [p.rank, p.name, p.dutiesCompleted, p.avgResponseMin ? p.avgResponseMin + 'm' : '—', p.rating + '%']));
        break;
      }

      case 'kpi': {
        const kpi = await novaFetch('/api/v1/analytics/kpi');
        reply = `<strong>📊 KPI Dashboard</strong><br><br>`;
        reply += `• <strong>Incidents MTD:</strong> ${kpi.totalIncidentsMTD} (${kpi.totalIncidentsMTDTrend > 0 ? '↑' : '↓'}${Math.abs(kpi.totalIncidentsMTDTrend)}%)<br>`;
        reply += `• <strong>Avg Response Time:</strong> ${kpi.avgResponseTimeMin} min ${kpi.avgResponseTimeMin <= 10 ? '✅ within target' : '⚠️ above 10-min target'}<br>`;
        reply += `• <strong>Critical Today:</strong> ${kpi.criticalIncidentsToday}<br>`;
        reply += `• <strong>Duty Completion:</strong> ${kpi.dutyCompletionRate}%`;
        break;
      }

      case 'priority_dist': {
        const pd = await novaFetch('/api/v1/analytics/priority-distribution');
        reply = `<strong>📊 Priority Distribution</strong> (${pd.total} total incidents)<br><br>`;
        pd.distribution.forEach(d => {
          const filled = Math.round(d.percent / 5);
          const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
          reply += `${priorityBadge(d.priority)}: ${bar} ${d.percent}% (${d.count})<br>`;
        });
        break;
      }

      case 'alerts': {
        const al = await novaFetch('/api/v1/alerts');
        if (!al.length) return '✅ No active alerts in the system.';
        reply = `<strong>🔔 ${al.length} Alert(s)</strong><br><br>`;
        al.slice(0, 5).forEach(a => {
          reply += `<strong>${a.title}</strong><br><span style="color:var(--text-muted);font-size:0.8em">${a.description || a.desc || ''}</span><br><br>`;
        });
        break;
      }

      case 'help':
        reply = `<strong>🤖 NOVA Command Guide</strong><br><br>`;
        reply += `<strong>📡 Situational Awareness</strong><br>`;
        reply += `• "What's the current situation?"<br>`;
        reply += `• "Give me a status update"<br><br>`;
        reply += `<strong>👮 Officers</strong><br>`;
        reply += `• "Who's available?" / "Show all officers"<br>`;
        reply += `• "Who's off duty?"<br><br>`;
        reply += `<strong>🚨 Incidents</strong><br>`;
        reply += `• "Show unassigned incidents"<br>`;
        reply += `• "List critical incidents"<br>`;
        reply += `• "Show all incidents"<br><br>`;
        reply += `<strong>⚡ Actions (Admin/Dispatcher)</strong><br>`;
        reply += `• "Assign nearest officer to incident 7"<br>`;
        reply += `• "Resolve incident 5"<br>`;
        reply += `• "Complete duty 3"<br><br>`;
        reply += `<strong>📋 Duties</strong><br>`;
        reply += `• "Active duties" / "All duties"<br><br>`;
        reply += `<strong>📊 Analytics</strong><br>`;
        reply += `• "Show KPIs" / "Officer performance"<br>`;
        reply += `• "Priority distribution"`;
        break;

      default:
        // If there's a pending action, remind them
        if (window._novaPending) {
          const p = window._novaPending;
          return `Waiting for confirmation on: <strong>${p.action.replace('_', ' ')} #${p.incidentId || p.dutyId}</strong>.<br>Reply <strong>yes</strong> to confirm or <strong>no</strong> to cancel.`;
        }
        reply = `I didn't quite understand that. Try rephrasing, or type <strong>"help"</strong> to see all available commands.`;
    }

  } catch (e) {
    reply = `⚠️ <strong>API Error:</strong> ${e.message}<br><small>Check that you're logged in and the backend is reachable.</small>`;
  }

  return reply;
}

// ── UI Rendering ──────────────────────────────────────
function toggleNova() {
  novaOpen = !novaOpen;
  document.getElementById('novaPanel').classList.toggle('open', novaOpen);
  document.getElementById('novaFab').classList.toggle('active', novaOpen);
  if (novaOpen && novaMessages.length === 0) {
    addNovaMessage('nova', `<strong>NOVA Online</strong> — ${new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}<br><br>Hello, <strong>${novaUser() || 'Operator'}</strong> (${novaRole() || 'guest'}). I'm your AI command assistant.<br>Type <strong>"help"</strong> to see commands or ask me anything about current operations.`);
  }
}

function addNovaMessage(role, content) {
  novaMessages.push({ role, content });
  renderNovaMessages();
}

function renderNovaMessages() {
  const container = document.getElementById('novaMessages');
  if (!container) return;
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
  const typing = document.getElementById('novaTyping');
  if (typing) typing.style.display = 'flex';
  const reply = await novaRespond(msg);
  if (typing) typing.style.display = 'none';
  novaProcessing = false;
  addNovaMessage('nova', reply);
}

// Enter key handler
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('novaInput');
  if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') sendNovaMessage(); });
});
