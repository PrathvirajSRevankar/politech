// ══════════════════════════════════════════════════════
// NOVA v4 — Knowledge Base Command Assistant
// Answers powered by POLITECH Q&A database
// ══════════════════════════════════════════════════════

const NOVA_API = 'https://politech.onrender.com';

let novaOpen = false;
let novaMessages = [];
let novaProcessing = false;

// ── Auth ──────────────────────────────────────────────
function novaToken() { return localStorage.getItem('pt_token') || ''; }
function novaRole()  { return localStorage.getItem('pt_role')  || ''; }
function novaUser()  { return localStorage.getItem('pt_user')  || ''; }

// ── POLITECH API ──────────────────────────────────────
async function novaFetch(path, opts = {}) {
  const res = await fetch(NOVA_API + path, {
    ...opts,
    headers: { 'Authorization': 'Bearer ' + novaToken(), 'Content-Type': 'application/json', ...(opts.headers || {}) }
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || res.statusText); }
  if (res.status === 204) return null;
  return res.json();
}

// ── Q&A Knowledge Base lookup ─────────────────────────
async function novaAsk(message) {
  try {
    const res = await fetch(NOVA_API + '/api/v1/nova/chat', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + novaToken(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.reply || null;
  } catch { return null; }
}

// ── Haversine ─────────────────────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371, dLat = (lat2-lat1)*Math.PI/180, dLon = (lon2-lon1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── Format helpers ────────────────────────────────────
function fmtTable(headers, rows) {
  if (!rows.length) return '<em>No records found.</em>';
  let h = '<table class="nova-table"><thead><tr>' + headers.map(x=>`<th>${x}</th>`).join('') + '</tr></thead><tbody>';
  rows.forEach(r => { h += '<tr>' + r.map(c=>`<td>${c??'—'}</td>`).join('') + '</tr>'; });
  return h + '</tbody></table>';
}
function dot(s) { const c={available:'#10b981',assigned:'#3b82f6','off-duty':'#64748b'}; return `<span style="color:${c[s]||'#94a3b8'}">● ${s}</span>`; }
function badge(p) { const c={Critical:'#ef4444',High:'#f59e0b',Medium:'#3b82f6',Low:'#10b981'}; return `<span style="color:${c[p]||'#94a3b8'};font-weight:700">${p||'—'}</span>`; }
function extractId(msg) { const m=msg.match(/\b(\d+)\b/); return m?parseInt(m[1]):null; }

// ── Intent Classifier (local, no API calls) ───────────
function classifyIntent(msg) {
  const m = msg.toLowerCase().trim();
  const id = extractId(msg);
  if (/^(yes|y|confirm|go|proceed|sure|ok|yep)$/i.test(m)) return {intent:'confirm',id:null};
  if (/^(no|n|cancel|abort|stop|nope)$/i.test(m)) return {intent:'cancel',id:null};
  if (/situation|status|overview|sitrep|briefing|what.*happen|summary/i.test(m)) return {intent:'situation',id:null};
  if (/assign|deploy|send|dispatch|nearest/i.test(m)) return {intent:'assign',id};
  if (/resolv|close.*incident/i.test(m)) return {intent:'resolve',id};
  if (/complet.*duty|finish.*duty|done.*duty/i.test(m)) return {intent:'complete_duty',id};
  if (/avail/i.test(m)) return {intent:'available_officers',id:null};
  if (/off.?dut/i.test(m)) return {intent:'offduty_officers',id:null};
  if (/officer|force|roster|personnel/i.test(m)) return {intent:'all_officers',id:null};
  if (/unassign|pending|open.*incident/i.test(m)) return {intent:'unassigned_incidents',id:null};
  if (/critical|urgent/i.test(m)) return {intent:'critical_incidents',id:null};
  if (/incident|call|crime|case/i.test(m)) return {intent:'all_incidents',id:null};
  if (/active dut/i.test(m)) return {intent:'active_duties',id:null};
  if (/dut/i.test(m)) return {intent:'all_duties',id:null};
  if (/kpi|metric|stat/i.test(m)) return {intent:'kpi',id:null};
  if (/perform|leaderboard|top officer/i.test(m)) return {intent:'performance',id:null};
  if (/priority|distribution|severity/i.test(m)) return {intent:'priority_dist',id:null};
  if (/alert|warning/i.test(m)) return {intent:'alerts',id:null};
  if (/help|command/i.test(m)) return {intent:'help',id:null};
  return {intent:'unknown',id:null};
}

// ── Execute tool & build reply ────────────────────────
async function novaRespond(userMsg) {
  const { intent, id } = classifyIntent(userMsg);

  // Pending confirmation
  if (intent === 'confirm' && window._novaPending) {
    const p = window._novaPending; window._novaPending = null;
    try {
      if (p.action === 'assign') {
        await novaFetch(`/api/v1/incidents/${p.incidentId}/assign`, { method:'PATCH', body: JSON.stringify({officerId: p.officerId}) });
        if (typeof refreshAll === 'function') refreshAll();
        return `✅ <strong>${p.officerName}</strong> assigned to incident #${p.incidentId}. Duty created, dashboard updated.`;
      }
      if (p.action === 'resolve') {
        await novaFetch(`/api/v1/incidents/${p.incidentId}/resolve`, { method:'PATCH' });
        if (typeof refreshAll === 'function') refreshAll();
        return `✅ Incident #${p.incidentId} resolved and closed.`;
      }
      if (p.action === 'complete_duty') {
        await novaFetch(`/api/v1/duties/${p.dutyId}/complete`, { method:'PATCH' });
        if (typeof refreshAll === 'function') refreshAll();
        return `✅ Duty #${p.dutyId} completed. Officer now available.`;
      }
    } catch(e) { return `❌ Action failed: ${e.message}`; }
  }
  if (intent === 'cancel') { window._novaPending = null; return 'Action cancelled.'; }

  try {
    switch(intent) {
      case 'situation': {
        const [off, inc, kpi] = await Promise.all([novaFetch('/api/v1/officers'), novaFetch('/api/v1/incidents'), novaFetch('/api/v1/analytics/kpi')]);
        const avail = off.filter(o=>o.status==='available').length;
        const active = inc.filter(i=>!i.resolvedAt);
        const unassigned = active.filter(i=>!i.assignedTo);
        const critUnassigned = unassigned.filter(i=>i.priority==='Critical');
        let r = `<strong>📡 OPERATIONAL SNAPSHOT</strong><br><br>`;
        r += `<strong>Force:</strong> ${avail} available · ${off.filter(o=>o.status==='assigned').length} deployed · ${off.filter(o=>o.status==='off-duty').length} off-duty<br>`;
        r += `<strong>Incidents:</strong> ${active.length} active · ${unassigned.length} unassigned<br>`;
        if(kpi) r += `<strong>KPIs:</strong> ${kpi.totalIncidentsMTD} MTD · ${kpi.avgResponseTimeMin}m avg response · ${kpi.dutyCompletionRate}% duty completion<br>`;
        if(critUnassigned.length) r += `<br>⚠️ <strong>${critUnassigned.length} unassigned critical incident(s)!</strong>`;
        return r;
      }
      case 'available_officers': {
        const off = await novaFetch('/api/v1/officers');
        const avail = off.filter(o=>o.status==='available');
        if(!avail.length) return '🔴 No officers currently available.';
        return `<strong>✅ ${avail.length} Available</strong><br><br>` + fmtTable(['Name','Rank','Badge'], avail.map(o=>[o.name,o.rank,o.badge]));
      }
      case 'offduty_officers': {
        const off = await novaFetch('/api/v1/officers');
        const od = off.filter(o=>o.status==='off-duty'||o.status==='offduty');
        if(!od.length) return '✅ Full force active — no officers off-duty.';
        return `<strong>😴 ${od.length} Off-Duty</strong><br><br>` + fmtTable(['Name','Rank'], od.map(o=>[o.name,o.rank]));
      }
      case 'all_officers': {
        const off = await novaFetch('/api/v1/officers');
        return `<strong>👮 ${off.length} Officers</strong><br><br>` + fmtTable(['Name','Rank','Status'], off.map(o=>[o.name,o.rank,dot(o.status)]));
      }
      case 'unassigned_incidents': {
        const inc = await novaFetch('/api/v1/incidents?assigned=false');
        const active = inc.filter(i=>!i.resolvedAt);
        if(!active.length) return '✅ All incidents assigned.';
        return `<strong>🔔 ${active.length} Unassigned</strong><br><br>` + fmtTable(['ID','Type','Location','Priority'], active.map(i=>[i.id,i.type,i.location,badge(i.priority)]));
      }
      case 'critical_incidents': {
        const inc = await novaFetch('/api/v1/incidents?priority=Critical');
        const active = inc.filter(i=>!i.resolvedAt);
        if(!active.length) return '✅ No critical incidents.';
        return `<strong>🔴 ${active.length} Critical</strong><br><br>` + fmtTable(['ID','Type','Location','Assigned'], active.map(i=>[i.id,i.type,i.location,i.assignedTo||'❌ Unassigned']));
      }
      case 'all_incidents': {
        const inc = await novaFetch('/api/v1/incidents');
        const active = inc.filter(i=>!i.resolvedAt);
        if(!active.length) return '✅ No active incidents.';
        return `<strong>📋 ${active.length} Active Incidents</strong><br><br>` + fmtTable(['ID','Type','Priority','Assigned'], active.slice(0,10).map(i=>[i.id,i.type,badge(i.priority),i.assignedTo||'—']));
      }
      case 'assign': {
        const incId = id || extractId(userMsg);
        if(!incId) return 'Please include an incident ID. Example: <em>"Assign to incident 7"</em>';
        const [inc, off] = await Promise.all([novaFetch('/api/v1/incidents'), novaFetch('/api/v1/officers')]);
        const incident = inc.find(i=>i.id===incId);
        if(!incident) return `❌ Incident #${incId} not found.`;
        if(incident.resolvedAt) return `Incident #${incId} is already resolved.`;
        if(incident.assignedTo) return `Incident #${incId} is already assigned to <strong>${incident.assignedTo}</strong>.`;
        const avail = off.filter(o=>o.status==='available');
        if(!avail.length) return '🔴 No available officers.';
        let best = avail[0], bestDist = Infinity;
        avail.forEach(o => {
          const oLat = o.mapPos?.lat||o.lat, oLng = o.mapPos?.lng||o.lng;
          const iLat = incident.mapPos?.lat||incident.lat, iLng = incident.mapPos?.lng||incident.lng;
          if(oLat&&oLng&&iLat&&iLng) { const d=haversine(oLat,oLng,iLat,iLng); if(d<bestDist){bestDist=d;best=o;} }
        });
        window._novaPending = {action:'assign', incidentId:incId, officerId:best.id, officerName:best.name};
        const distStr = bestDist<Infinity ? ` (${bestDist.toFixed(1)} km away)` : '';
        return `<strong>📍 Recommendation</strong><br><br>Incident <strong>#${incId}</strong>: ${incident.type} at ${incident.location} — ${badge(incident.priority)}<br>Best match: <strong>${best.name}</strong> (${best.rank})${distStr}<br><br><strong>Confirm?</strong> <em>yes / no</em>`;
      }
      case 'resolve': {
        const incId = id || extractId(userMsg);
        if(!incId) return 'Please include an incident ID. Example: <em>"Resolve incident 5"</em>';
        window._novaPending = {action:'resolve', incidentId:incId};
        return `Resolve incident <strong>#${incId}</strong>? <strong>Confirm?</strong> <em>yes / no</em>`;
      }
      case 'complete_duty': {
        const dutyId = id || extractId(userMsg);
        if(!dutyId) return 'Please include a duty ID. Example: <em>"Complete duty 3"</em>';
        window._novaPending = {action:'complete_duty', dutyId};
        return `Mark duty <strong>#${dutyId}</strong> complete? <strong>Confirm?</strong> <em>yes / no</em>`;
      }
      case 'active_duties': {
        const dut = await novaFetch('/api/v1/duties?completed=false');
        if(!dut.length) return '✅ No active duties.';
        return `<strong>📋 ${dut.length} Active Duties</strong><br><br>` + fmtTable(['ID','Type','Officer','Location','Priority'], dut.map(d=>[d.id,d.type,d.officerName,d.location,badge(d.priority)]));
      }
      case 'all_duties': {
        const dut = await novaFetch('/api/v1/duties');
        return `<strong>📋 ${dut.length} Duties</strong><br><br>` + fmtTable(['ID','Type','Officer','Status'], dut.slice(0,10).map(d=>[d.id,d.type,d.officerName,d.completed?'✅':'🔄']));
      }
      case 'kpi': {
        const kpi = await novaFetch('/api/v1/analytics/kpi');
        return `<strong>📊 KPIs</strong><br><br>• Incidents MTD: ${kpi.totalIncidentsMTD}<br>• Avg Response: ${kpi.avgResponseTimeMin} min<br>• Critical Today: ${kpi.criticalIncidentsToday}<br>• Duty Completion: ${kpi.dutyCompletionRate}%`;
      }
      case 'performance': {
        const perf = await novaFetch('/api/v1/analytics/officer-performance');
        if(!perf.length) return 'No performance data yet.';
        return `<strong>🏆 Leaderboard</strong><br><br>` + fmtTable(['#','Name','Duties','Avg RT','Rating'], perf.slice(0,8).map(p=>[p.rank,p.name,p.dutiesCompleted,p.avgResponseMin?p.avgResponseMin+'m':'—',p.rating+'%']));
      }
      case 'priority_dist': {
        const pd = await novaFetch('/api/v1/analytics/priority-distribution');
        let r = `<strong>📊 Priority Distribution</strong> (${pd.total} total)<br><br>`;
        pd.distribution.forEach(d => { r += `${badge(d.priority)}: ${'█'.repeat(Math.round(d.percent/5))}${'░'.repeat(20-Math.round(d.percent/5))} ${d.percent}% (${d.count})<br>`; });
        return r;
      }
      case 'alerts': {
        const al = await novaFetch('/api/v1/alerts');
        if(!al.length) return '✅ No active alerts.';
        let r = `<strong>🔔 ${al.length} Alert(s)</strong><br><br>`;
        al.slice(0,5).forEach(a => { r += `<strong>${a.title}</strong><br><span style="color:var(--text-muted);font-size:0.8em">${a.description||''}</span><br><br>`; });
        return r;
      }
      case 'help':
        return `<strong>🤖 NOVA Commands</strong><br><br><strong>Situation:</strong> "What's happening?" / "Give me a sitrep"<br><strong>Officers:</strong> "Who's available?" / "Show all officers" / "Who's off duty?"<br><strong>Incidents:</strong> "Unassigned incidents" / "Critical incidents" / "All incidents"<br><strong>Duties:</strong> "Active duties" / "All duties"<br><strong>Actions:</strong> "Assign to incident 7" / "Resolve incident 5" / "Complete duty 3"<br><strong>Analytics:</strong> "KPIs" / "Officer performance" / "Priority distribution"<br><strong>Alerts:</strong> "Show alerts"<br><br>📚 <strong>Knowledge Base active</strong> — ask me anything about POLITECH!`;
      default: {
        if(window._novaPending) return `Waiting for confirmation. Reply <strong>yes</strong> or <strong>no</strong>.`;
        // Look up in Q&A knowledge base
        const kbReply = await novaAsk(userMsg);
        return kbReply || `I don't have an answer for that yet. Type <strong>"help"</strong> for available commands.`;
      }
    }
  } catch(e) {
    return `⚠️ <strong>Error:</strong> ${e.message}`;
  }
}

// ── Settings UI ───────────────────────────────────────
function novaOpenSettings() {
  addNovaMessage('nova', '📚 <strong>NOVA Knowledge Base</strong><br><br>NOVA uses a built-in Q&A database with <strong>36 answers</strong> about POLITECH — no external AI required. All answers are instant and always available.');
}

// ── UI ────────────────────────────────────────────────
function toggleNova() {
  novaOpen = !novaOpen;
  document.getElementById('novaPanel').classList.toggle('open', novaOpen);
  document.getElementById('novaFab').classList.toggle('active', novaOpen);
  if(novaOpen && novaMessages.length===0) {
    addNovaMessage('nova', `<strong>NOVA Online</strong> — ${new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}<br><br>Hello <strong>${novaUser()||'Operator'}</strong> (${novaRole()||'guest'}).<br><br>📚 I have a built-in <strong>Knowledge Base</strong> with answers about POLITECH. I can also help with live operations — type <strong>"help"</strong> to see all commands.`);
  }
}

function addNovaMessage(role, content) {
  novaMessages.push({role, content});
  renderNovaMessages();
}

function renderNovaMessages() {
  const c = document.getElementById('novaMessages');
  if(!c) return;
  c.innerHTML = novaMessages.map(m => {
    const isNova = m.role==='nova';
    return `<div class="nova-msg ${isNova?'nova-bot':'nova-user'}">${isNova?'<div class="nova-avatar"><i class="fas fa-robot"></i></div>':''}<div class="nova-bubble ${isNova?'bot':'user'}">${m.content}</div></div>`;
  }).join('');
  c.scrollTop = c.scrollHeight;
}

async function sendNovaMessage() {
  const input = document.getElementById('novaInput');
  const msg = input.value.trim();
  if(!msg || novaProcessing) return;
  input.value = '';
  addNovaMessage('user', msg);
  novaProcessing = true;
  const t = document.getElementById('novaTyping');
  if(t) t.style.display='flex';
  const reply = await novaRespond(msg);
  if(t) t.style.display='none';
  novaProcessing = false;
  addNovaMessage('nova', reply);
}

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('novaInput');
  if(input) input.addEventListener('keydown', e => { if(e.key==='Enter') sendNovaMessage(); });
});
