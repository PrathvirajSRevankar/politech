# 🚔 POLITECH Backend — Vibe Coding Guide

> **What this is:** A plain-language, step-by-step instruction sheet to build the POLITECH backend from scratch using an AI coding assistant (Cursor, Copilot, Windsurf, etc.).  
> **Stack:** Python + FastAPI + PostgreSQL (recommended). Node/Express alternative noted where relevant.  
> **Source doc:** `backend_documentation.md`

---

## 🧠 Before You Start — Read This Once

You are building the backend for **POLITECH**, a police command & analytics dashboard. The frontend (`police.html`, `analytics.html`) currently has all data hardcoded in JavaScript. Your job is to replace that with a real server that:

- Stores data in a PostgreSQL database
- Serves a REST API at `/api/v1/...`
- Pushes live updates via WebSocket
- Enforces JWT-based role authentication

When prompting your AI assistant, always paste the relevant section of this guide as context. Be specific. Short prompts = generic code. Long prompts = tailored code.

---

## ⚙️ STEP 1 — Project Scaffold

**Prompt your AI:**

> "Scaffold a FastAPI project called `politech-backend` with this structure:
> ```
> backend/
>   main.py
>   db.py
>   auth.py
>   routers/
>     officers.py
>     incidents.py
>     duties.py
>     alerts.py
>     analytics.py
>     ws.py
>   models/
>     officer.py
>     incident.py
>     duty.py
>     alert.py
>   schemas/
>     officer.py
>     incident.py
>     duty.py
>     alert.py
> ```
> Use SQLAlchemy 2.x for ORM, Alembic for migrations, Pydantic v2 for validation, and Uvicorn as the server. Install: `fastapi uvicorn sqlalchemy alembic psycopg2-binary python-jose passlib websockets python-dotenv`"

---

## 🗄️ STEP 2 — Database & Environment Setup

### 2a. Environment Variables

Create a `.env` file at project root:

```env
PORT=8000
NODE_ENV=development
DATABASE_URL=postgresql://user:password@localhost:5432/politech
JWT_SECRET=your_super_secret_key_here
JWT_EXPIRY=8h
GOOGLE_MAPS_API_KEY=your_key_here
WS_HEARTBEAT_INTERVAL=30000
ALLOWED_ORIGINS=http://localhost:3000,https://your-production-domain.com
```

**Prompt your AI:**

> "Create `db.py` that reads `DATABASE_URL` from `.env` using `python-dotenv`, sets up a SQLAlchemy async engine and session factory, and exposes a `get_db` dependency for FastAPI."

### 2b. Database Schema

**Prompt your AI:**

> "Create SQLAlchemy 2.x ORM models in the `models/` folder using this exact SQL schema. Each model should live in its own file and import from `db.py`.
>
> ```sql
> CREATE TABLE officers (
>     id SERIAL PRIMARY KEY,
>     name VARCHAR(100) NOT NULL,
>     rank VARCHAR(50) NOT NULL,
>     badge VARCHAR(20) UNIQUE NOT NULL,
>     status VARCHAR(20) NOT NULL DEFAULT 'available'
>         CHECK (status IN ('available', 'assigned', 'offduty')),
>     last_seen TIMESTAMPTZ,
>     lat DOUBLE PRECISION,
>     lng DOUBLE PRECISION,
>     created_at TIMESTAMPTZ DEFAULT NOW()
> );
>
> CREATE TABLE incidents (
>     id SERIAL PRIMARY KEY,
>     type VARCHAR(100) NOT NULL,
>     location VARCHAR(200) NOT NULL,
>     priority VARCHAR(20) NOT NULL CHECK (priority IN ('Low', 'Medium', 'High', 'Critical')),
>     time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
>     assigned_officer_id INTEGER REFERENCES officers(id) ON DELETE SET NULL,
>     assigned_to VARCHAR(100),
>     lat DOUBLE PRECISION,
>     lng DOUBLE PRECISION,
>     resolved_at TIMESTAMPTZ,
>     created_at TIMESTAMPTZ DEFAULT NOW()
> );
>
> CREATE TABLE duties (
>     id SERIAL PRIMARY KEY,
>     type VARCHAR(30) NOT NULL CHECK (type IN ('Patrol','Investigation','Traffic','Desk','Emergency')),
>     officer_id INTEGER NOT NULL REFERENCES officers(id) ON DELETE CASCADE,
>     officer_name VARCHAR(100),
>     location VARCHAR(200) NOT NULL,
>     details TEXT,
>     priority VARCHAR(20) NOT NULL CHECK (priority IN ('Low','Medium','High','Critical')),
>     completed BOOLEAN DEFAULT FALSE,
>     created_at TIMESTAMPTZ DEFAULT NOW(),
>     completed_at TIMESTAMPTZ
> );
>
> CREATE TABLE alerts (
>     id SERIAL PRIMARY KEY,
>     type VARCHAR(20) NOT NULL CHECK (type IN ('critical','warning','info')),
>     icon VARCHAR(60),
>     title VARCHAR(150) NOT NULL,
>     description TEXT,
>     time TIMESTAMPTZ DEFAULT NOW()
> );
>
> CREATE INDEX idx_duties_officer ON duties(officer_id);
> CREATE INDEX idx_incidents_priority ON incidents(priority);
> CREATE INDEX idx_duties_completed ON duties(completed);
> CREATE INDEX idx_incidents_time ON incidents(time);
> ```"

### 2c. Pydantic Schemas

**Prompt your AI:**

> "For each model (Officer, Incident, Duty, Alert), create Pydantic v2 schemas in `schemas/`:
> - `XxxCreate` — fields required on creation (no `id`)
> - `XxxUpdate` — all fields optional (for PATCH)
> - `XxxOut` — full response schema including `id`
>
> Map DB column `last_seen` ↔ `lastSeen`, `lat/lng` → nested `mapPos: { lat, lng }`, `assigned_officer_id` → `assignedOfficerId`, `officer_id` → `officerId`, `completed_at` → `completedAt`, `created_at` → `createdAt`.
> Use `model_config = ConfigDict(from_attributes=True)` on all `Out` schemas."

---

## 🔐 STEP 3 — Authentication

**Prompt your AI:**

> "Create `auth.py` with:
> 1. A `User` model with fields: `id`, `username`, `hashed_password`, `role` (enum: `admin`, `dispatcher`, `officer`, `analyst`)
> 2. Password hashing with `passlib[bcrypt]`
> 3. JWT creation and verification using `python-jose` — read `JWT_SECRET` and `JWT_EXPIRY` from env
> 4. A `get_current_user` FastAPI dependency that reads the `Authorization: Bearer <token>` header
> 5. A role-checking dependency factory: `require_role('admin', 'dispatcher')` that raises 403 if the user's role is not in the list
> 6. A `POST /auth/login` endpoint that accepts `{username, password}` and returns `{access_token, token_type}`"

---

## 👮 STEP 4 — Officers API (`routers/officers.py`)

**Prompt your AI:**

> "Build the Officers router at prefix `/api/v1/officers`. Use the `OfficerOut`, `OfficerCreate`, `OfficerUpdate` schemas from `schemas/officer.py`.
>
> Endpoints:
>
> **GET /** — Return all officers. Optional query param `status` to filter by `available | assigned | offduty`. Minimum role: `officer`.
>
> **GET /:id** — Return single officer. 404 if not found.
>
> **POST /** — Create officer. Role: `admin`. Return 201.
>
> **PATCH /:id** — Partial update. Role: `dispatcher`. **Business rule:** If `status` changes from `assigned` → `available`, find any active (not completed) Duty for this officer and mark it `completed = true`, `completed_at = now()`. After any status change, call `broadcast_ws('officer:status_changed', {officerId, status, lastSeen})`.
>
> **DELETE /:id** — Delete officer. Role: `admin`. First unassign the officer from any active duties (set `completed = true`). Return 204."

---

## 🚨 STEP 5 — Incidents API (`routers/incidents.py`)

**Prompt your AI:**

> "Build the Incidents router at prefix `/api/v1/incidents`. Use `IncidentOut`, `IncidentCreate`, `IncidentUpdate` schemas.
>
> Endpoints:
>
> **GET /** — Return all incidents, newest first. Query params: `assigned` (bool), `priority` (string), `limit` (int, default 50). Role: `officer`.
>
> **GET /:id** — Single incident or 404.
>
> **POST /** — Create incident. Server sets `time = now()`. Role: `dispatcher`. After creation, call `broadcast_ws('incident:new', incident_data)`.
>
> **PATCH /:id/assign** — Assign officer to incident.
> Request body: `{ officerId: int }`
> Business logic (in this order):
> 1. Verify officer exists and `status == 'available'`. Return 400 `{error: 'Officer is not available'}` if not.
> 2. Set `incident.assignedOfficerId = officerId`, `incident.assignedTo = officer.name`.
> 3. Set `officer.status = 'assigned'`.
> 4. Auto-create a Duty record: `{type: 'Emergency', officerId, location: incident.location, priority: incident.priority}`.
> 5. Broadcast `officer:status_changed` and `incident:assigned` WebSocket events.
> Return updated incident.
>
> **PATCH /:id/resolve** — Set `resolvedAt = now()`. Broadcast `incident:resolved`. Role: `dispatcher`.
>
> **DELETE /:id** — Delete. Role: `admin`. Return 204."

---

## 📋 STEP 6 — Duties API (`routers/duties.py`)

**Prompt your AI:**

> "Build the Duties router at prefix `/api/v1/duties`.
>
> **GET /** — All duties. Query params: `completed` (bool), `officerId` (int), `type` (string). Role: `officer`.
>
> **POST /** — Create duty.
> Request body: `{ type, officerId, location, details, priority }`
> Business logic:
> 1. Validate officer exists and `status == 'available'`. Return 400 if not.
> 2. Set `officer.status = 'assigned'`.
> 3. Create duty with `createdAt = now()`, `completed = false`.
> 4. Broadcast `officer:status_changed` and `duty:created` WebSocket events.
> Return 201 with created duty.
>
> **PATCH /:id** — Edit duty fields (type, location, priority, details). Role: `dispatcher`.
>
> **PATCH /:id/complete** — Complete a duty.
> Business logic:
> 1. Set `duty.completed = true`, `duty.completedAt = now()`.
> 2. Set `officer.status = 'available'`, `officer.lastSeen = now()`.
> 3. Broadcast `officer:status_changed` and `duty:completed` WebSocket events.
>
> **DELETE /:id** — Delete duty, set officer back to `available`. Broadcast `duty:deleted`. Role: `dispatcher`. Return 204."

---

## 🔔 STEP 7 — Alerts API (`routers/alerts.py`)

**Prompt your AI:**

> "Build the Alerts router at prefix `/api/v1/alerts`.
>
> **GET /** — Return all alerts, newest first. Role: `officer`.
>
> **POST /** — Create alert. Broadcast `alert:new` WebSocket event. Role: `admin | dispatcher`.
>
> Schema: `{ type: 'critical'|'warning'|'info', icon: string, title: string, desc: string }`
> Server sets `time = now()`. Return 201."

---

## 📊 STEP 8 — Stats Endpoint

**Prompt your AI:**

> "Add `GET /api/v1/stats` that computes and returns:
> ```json
> {
>   'activeDuties': COUNT duties WHERE completed = false,
>   'officersAvailable': COUNT officers WHERE status = 'available',
>   'officersDeployed': COUNT officers WHERE status = 'assigned',
>   'completedToday': COUNT duties WHERE completed = true AND DATE(completed_at) = today,
>   'totalIncidents': COUNT all incidents
> }
> ```
> Role: `officer`. After any state-changing operation, call `broadcast_ws('stats:update', stats_object)`."

---

## 📈 STEP 9 — Analytics Endpoints (`routers/analytics.py`)

All analytics endpoints require minimum role: `analyst`.

**Prompt your AI (send one at a time):**

### 9a. KPI Summary
> "Add `GET /api/v1/analytics/kpi` that returns:
> - `totalIncidentsMTD`: COUNT incidents this calendar month
> - `totalIncidentsMTDTrend`: % change vs previous month (positive = increase)
> - `avgResponseTimeMin`: AVG minutes between `incident.time` and `duty.completedAt` for Emergency duties
> - `avgResponseTimeTrend`: % change vs previous week
> - `criticalIncidentsToday`: COUNT incidents WHERE priority='Critical' AND DATE(time)=today
> - `criticalTrendFromYesterday`: difference vs yesterday's count
> - `dutyCompletionRate`: completed/total duties this week * 100
> - `dutyCompletionTrend`: difference vs last week's rate"

### 9b. Crime Heatmap
> "Add `GET /api/v1/analytics/heatmap`. Divide incidents into 8 geographic sectors (N, NE, E, SE, S, SW, W, NW) based on their lat/lng relative to the district center (13.3409° N, 77.1020° E). Count incidents per sector per month for the last 12 calendar months. Normalize all values to 0.0–1.0 by dividing each count by the max count across all cells. Return:
> `{ sectors: [...], months: [...], data: [[float x 12] x 8] }`"

### 9c. Response Time
> "Add `GET /api/v1/analytics/response-time` returning avg/best/worst response times in minutes, plus breakdown by shift (Morning 06-14, Afternoon 14-22, Night 22-06) with load category (Low <30, Normal 30-60, High >60 incidents)."

### 9d–9h. Remaining Analytics
> "Add these five analytics endpoints, each aggregating from the duties and incidents tables:
> - `GET /api/v1/analytics/incidents-by-day` → COUNT incidents grouped by day of week for current month. Return `[{label:'Mon', val:N}, ...]`
> - `GET /api/v1/analytics/incidents-by-type` → COUNT duties grouped by type. Return `[{label:'Patrol', val:N}, ...]`
> - `GET /api/v1/analytics/officers-deployed` → COUNT DISTINCT officerId from duties per day of week. Return `[{label:'Mon', val:N}, ...]`
> - `GET /api/v1/analytics/priority-distribution` → COUNT incidents grouped by priority. Return `{total, distribution: [{priority, count, percent}, ...]}`
> - `GET /api/v1/analytics/officer-performance` → Per officer: dutiesCompleted (completed=true), avgResponseMin (avg duty completedAt - incident.time for Emergency), rating = (1 - avgResponseMin/10) * 0.5 + (completedDuties/totalDuties) * 0.5 * 100. Order by rating DESC."

---

## 🔌 STEP 10 — WebSocket (`routers/ws.py`)

**Prompt your AI:**

> "Create a WebSocket manager and endpoint in `routers/ws.py`:
>
> 1. A `ConnectionManager` class with methods: `connect(ws)`, `disconnect(ws)`, `broadcast(event_name, payload)`. Store connected clients in a `set`.
> 2. `broadcast` sends JSON: `{ event: event_name, data: payload, timestamp: ISO_now }` to all connected clients. Silently skip dead connections.
> 3. Expose a global `broadcast_ws(event, payload)` coroutine that all routers import and call.
> 4. Add a WebSocket endpoint at `ws://your-server/ws` that:
>    - Accepts connections
>    - Responds to `{'event': 'ping'}` with `{'event': 'pong'}`
>    - Sends a heartbeat `{'event': 'heartbeat'}` every `WS_HEARTBEAT_INTERVAL` ms (from env, default 30s)
>    - Removes disconnected clients gracefully
>
> WebSocket events the server must broadcast:
> | Event | Payload |
> |---|---|
> | `incident:new` | Full Incident object |
> | `incident:assigned` | `{ incidentId, officerId, officerName }` |
> | `incident:resolved` | `{ incidentId }` |
> | `officer:status_changed` | `{ officerId, status, lastSeen }` |
> | `duty:created` | Full Duty object |
> | `duty:completed` | `{ dutyId, officerId }` |
> | `duty:deleted` | `{ dutyId }` |
> | `alert:new` | Full Alert object |
> | `stats:update` | Full stats object |"

---

## 🏁 STEP 11 — Wire Everything in `main.py`

**Prompt your AI:**

> "Update `main.py` to:
> 1. Create the FastAPI app with title 'POLITECH API', version '1.0'
> 2. Add CORS middleware reading `ALLOWED_ORIGINS` from env (split by comma)
> 3. Include all routers with prefix `/api/v1`: officers, incidents, duties, alerts, analytics, stats
> 4. Include the ws router (no `/api/v1` prefix, just `/ws`)
> 5. Add a startup event that runs `alembic upgrade head` (or SQLAlchemy `create_all` for dev)
> 6. Add a `GET /health` endpoint returning `{status: 'ok', timestamp: now}`"

---

## 🌱 STEP 12 — Seed Data

**Prompt your AI:**

> "Create `seed.py` that inserts sample data into the database:
>
> Officers (at least 6):
> - Kiran Kumar, Sergeant, badge KA-7891, status available, lat 13.3392, lng 77.1016
> - Ramesh Gowda, Inspector, badge KA-3421, status available, lat 13.3405, lng 77.0985
> - Ananya Patel, Officer, badge KA-9912, status available, lat 13.3378, lng 77.1034
> - Suresh Naik, Constable, badge KA-5523, status available, lat 13.3415, lng 77.1010
> - Deepa Rao, Inspector, badge KA-7734, status offduty, lat 13.3390, lng 77.0998
> - Mohan Das, Sergeant, badge KA-2210, status available, lat 13.3401, lng 77.1050
>
> Incidents (use types: Break-in Report, Vehicle Pursuit, Missing Person, Disturbance Call, Drug Suspicion, Fire Assist, Vandalism, Assault Report, Robbery in Progress, Traffic Collision, Noise Complaint, Suspicious Vehicle):
> - Insert at least 8 incidents with varying priorities and locations around Tumkur district.
>
> Duties (at least 4, one per available officer):
> - Mix of Patrol and Investigation types, Medium/High priority.
>
> Alerts (at least 3):
> - One critical, one warning, one info.
>
> Run with `python seed.py` and print counts of inserted records."

---

## ✅ STEP 13 — Testing Checklist

Run these manually (or ask AI to generate pytest tests):

```bash
# Start server
uvicorn main:app --reload --port 8000

# Health check
curl http://localhost:8000/health

# Login
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# Get officers (use token from login)
curl http://localhost:8000/api/v1/officers \
  -H "Authorization: Bearer <token>"

# Create incident
curl -X POST http://localhost:8000/api/v1/incidents \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"type":"Robbery in Progress","location":"Ashoka Road","priority":"Critical","mapPos":{"lat":13.3381,"lng":77.1098}}'

# Assign officer to incident
curl -X PATCH http://localhost:8000/api/v1/incidents/1/assign \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"officerId":1}'

# WebSocket test (use wscat or browser console)
# wscat -c ws://localhost:8000/ws
```

**Verification points:**
- Officer status flips to `assigned` when a duty is created ✓
- Officer status flips back to `available` when duty is completed ✓
- WebSocket broadcasts fire on incident create, assign, resolve ✓
- Analytics KPI numbers match DB counts ✓
- JWT 403 fires correctly for wrong roles ✓

---

## 🔗 STEP 14 — Frontend Integration

Once backend is running, update `police.html` — replace these JS variables with API calls:

| Replace | With |
|---|---|
| `let officers = [...]` | `GET /api/v1/officers` on page load |
| `let duties = [...]` | `GET /api/v1/duties?completed=false` |
| `let incidents = [...]` | `GET /api/v1/incidents` |
| `let alerts = [...]` | `GET /api/v1/alerts` |
| `dutyForm.onsubmit` | `POST /api/v1/duties` |
| `completeDuty(id)` | `PATCH /api/v1/duties/:id/complete` |
| `deleteDuty(id)` | `DELETE /api/v1/duties/:id` |
| `dropOnIncident(e, incId)` | `PATCH /api/v1/incidents/:id/assign` |
| `addRandomIncident()` | `POST /api/v1/incidents` |

For `analytics.html`, replace all hardcoded chart arrays with:
- `GET /api/v1/analytics/kpi`
- `GET /api/v1/analytics/heatmap`
- `GET /api/v1/analytics/incidents-by-day`
- `GET /api/v1/analytics/incidents-by-type`
- `GET /api/v1/analytics/officers-deployed`
- `GET /api/v1/analytics/priority-distribution`
- `GET /api/v1/analytics/officer-performance`
- `GET /api/v1/analytics/response-time`

**WebSocket wiring** — add to `police.html`:
```js
const ws = new WebSocket('ws://localhost:8000/ws');
ws.onmessage = (e) => {
  const { event, data } = JSON.parse(e.data);
  if (event === 'incident:new') addIncidentToFeed(data);
  if (event === 'officer:status_changed') updateOfficerCard(data);
  if (event === 'stats:update') refreshStatBar(data);
  // ... handle other events
};
```

---

## ⚡ Quick Tips for Vibe Coding

- **Give context** — always paste the relevant section from `backend_documentation.md` into the prompt.
- **One step at a time** — don't ask for all routers in one go. Build and test each one before moving on.
- **Paste errors back** — when something fails, paste the full stack trace into the chat. The AI can fix it.
- **Ask for tests** — after each router: "Write pytest tests for everything in `routers/incidents.py` using TestClient."
- **Schema first** — if output looks wrong, ask: "Print the JSON schema for the Officer response model" and compare with §2.1 of the documentation.
- **WebSocket last** — build and test all REST endpoints first, add WebSocket in Step 10 when everything else works.

---

*End of POLITECH Vibe Coding Guide — Happy Building! 🚔*
