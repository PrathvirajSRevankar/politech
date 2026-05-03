# POLITECH — Backend API & System Documentation

> **Derived from**: `police.html` (Command Operations Center) and `analytics.html` (Analytics Suite)  
> **Purpose**: Complete specification for building the backend that powers the POLITECH frontend.

---

## Table of Contents
1. [System Overview](#1-system-overview)
2. [Data Models](#2-data-models)
3. [REST API Endpoints](#3-rest-api-endpoints)
4. [Analytics Aggregation Requirements](#4-analytics-aggregation-requirements)
5. [Real-Time Events (WebSocket)](#5-real-time-events-websocket)
6. [Authentication & Authorization](#6-authentication--authorization)
7. [Recommended Tech Stack](#7-recommended-tech-stack)
8. [Environment Variables & Configuration](#8-environment-variables--configuration)

---

## 1. System Overview

POLITECH is a **police duty-management and command dashboard** with two main pages:

| Page | File | Purpose |
|---|---|---|
| Command Operations Center | `police.html` | Live map, incident feed, officer force grid, duty roster, action hub |
| Analytics Suite | `analytics.html` | KPI cards, crime heatmap, charts, performance tables |

The frontend currently stores all state **in-memory in JavaScript**. The backend must replace those in-memory arrays with persistent REST endpoints and real-time WebSocket push.

---

## 2. Data Models

### 2.1 Officer

```json
{
  "id": 1,
  "name": "Kiran Kumar",
  "rank": "Sergeant",
  "badge": "KA-7891",
  "status": "available",
  "lastSeen": "2026-04-30T14:00:00Z",
  "mapPos": {
    "lat": 13.3392,
    "lng": 77.1016
  }
}
```

| Field | Type | Constraints | Description |
|---|---|---|---|
| `id` | integer | PK, auto-increment | Unique officer ID |
| `name` | string | max 100 | Full name |
| `rank` | string | max 50 | e.g. Sergeant, Inspector, Officer |
| `badge` | string | unique, max 20 | Badge number (e.g. KA-7891) |
| `status` | enum | `available`, `assigned`, `offduty` | Current operational status |
| `lastSeen` | ISO datetime | nullable | Last GPS/check-in timestamp |
| `mapPos.lat` | float | -90 to 90 | Latitude |
| `mapPos.lng` | float | -180 to 180 | Longitude |

---

### 2.2 Incident

```json
{
  "id": 101,
  "type": "Robbery in Progress",
  "location": "Ashoka Road",
  "priority": "Critical",
  "time": "2026-04-30T19:32:00Z",
  "assignedTo": null,
  "mapPos": {
    "lat": 13.3381,
    "lng": 77.1098
  }
}
```

| Field | Type | Constraints | Description |
|---|---|---|---|
| `id` | integer | PK, auto-increment | Unique incident ID |
| `type` | string | max 100 | Incident category (e.g. Robbery, Vandalism) |
| `location` | string | max 200 | Street / area description |
| `priority` | enum | `Low`, `Medium`, `High`, `Critical` | Urgency level |
| `time` | ISO datetime | required | When the incident was reported |
| `assignedTo` | string / null | nullable | Officer name assigned (denormalized for quick display; also store `assignedOfficerId`) |
| `assignedOfficerId` | integer / null | FK → Officers | Normalized officer reference |
| `mapPos.lat` | float | — | Latitude of incident |
| `mapPos.lng` | float | — | Longitude of incident |
| `resolvedAt` | ISO datetime / null | nullable | Time when closed/resolved |

**Incident types** (seeded from frontend):
`Break-in Report`, `Vehicle Pursuit`, `Missing Person`, `Disturbance Call`, `Drug Suspicion`, `Fire Assist`, `Vandalism`, `Assault Report`, `Robbery in Progress`, `Traffic Collision`, `Noise Complaint`, `Suspicious Vehicle`

---

### 2.3 Duty

```json
{
  "id": 1,
  "type": "Patrol",
  "officerId": 3,
  "officerName": "Ramesh Gowda",
  "location": "M G Road",
  "details": "Monitor suspicious activity near city center.",
  "priority": "Medium",
  "createdAt": "2026-04-30T08:00:00Z",
  "completedAt": null,
  "completed": false
}
```

| Field | Type | Constraints | Description |
|---|---|---|---|
| `id` | integer | PK, auto-increment | Unique duty ID |
| `type` | enum | `Patrol`, `Investigation`, `Traffic`, `Desk`, `Emergency` | Duty category |
| `officerId` | integer | FK → Officers | Assigned officer |
| `officerName` | string | denormalized | Officer name for display |
| `location` | string | max 200 | Sector / street |
| `details` | text | nullable | Operational briefing notes |
| `priority` | enum | `Low`, `Medium`, `High`, `Critical` | Urgency |
| `createdAt` | ISO datetime | auto | When duty was created |
| `completedAt` | ISO datetime / null | nullable | When duty was completed |
| `completed` | boolean | default false | Completion flag |

---

### 2.4 Alert (Command Center)

```json
{
  "id": 1,
  "type": "critical",
  "icon": "fa-triangle-exclamation",
  "title": "Code Red: Armed Suspect",
  "desc": "Suspect armed with firearm reported at Railway Station.",
  "time": "2026-04-30T19:41:00Z"
}
```

| Field | Type | Constraints | Description |
|---|---|---|---|
| `id` | integer | PK | Unique alert ID |
| `type` | enum | `critical`, `warning`, `info` | Severity — drives icon color in UI |
| `icon` | string | Font Awesome class | e.g. `fa-triangle-exclamation` |
| `title` | string | max 150 | Short alert headline |
| `desc` | string | max 500 | Detailed description |
| `time` | ISO datetime | — | When alert was raised |

---

### 2.5 Analytics Snapshot (derived / aggregated)

These are computed values returned by analytics endpoints (see §4). No separate persistent table is strictly required — they can be computed on-the-fly from the Duty and Incident tables.

---

## 3. REST API Endpoints

> **Base URL**: `/api/v1`  
> All endpoints accept and return `application/json`.  
> All timestamps are **ISO 8601 UTC**.

---

### 3.1 Officers

#### `GET /officers`
Returns all officers with their current status and map position.

**Response 200:**
```json
[
  {
    "id": 1,
    "name": "Kiran Kumar",
    "rank": "Sergeant",
    "badge": "KA-7891",
    "status": "available",
    "lastSeen": "2026-04-30T14:00:00Z",
    "mapPos": { "lat": 13.3392, "lng": 77.1016 }
  }
]
```

**Query Params:**

| Param | Type | Description |
|---|---|---|
| `status` | string | Filter by `available`, `assigned`, or `offduty` |

---

#### `GET /officers/:id`
Returns a single officer by ID.

**Response 200:** Single Officer object.  
**Response 404:** `{ "error": "Officer not found" }`

---

#### `POST /officers`
Creates a new officer record.

**Request Body:** Officer object (without `id`).  
**Response 201:** Created Officer object.

---

#### `PATCH /officers/:id`
Partial update — used primarily to change `status`, `lastSeen`, or `mapPos`.

**Request Body (example — status change):**
```json
{
  "status": "assigned",
  "lastSeen": "2026-04-30T19:45:00Z"
}
```
**Response 200:** Updated Officer object.

> **Business rule**: When `status` changes from `assigned` → `available`, the backend must also check if any active Duty for this officer exists and mark it completed if applicable.

---

#### `DELETE /officers/:id`
Removes an officer. Must unassign from any active duties first.

**Response 204:** No content.

---

### 3.2 Incidents

#### `GET /incidents`
Returns all incidents, newest first.

**Response 200:**
```json
[
  {
    "id": 101,
    "type": "Robbery in Progress",
    "location": "Ashoka Road",
    "priority": "Critical",
    "time": "2026-04-30T19:32:00Z",
    "assignedTo": null,
    "assignedOfficerId": null,
    "mapPos": { "lat": 13.3381, "lng": 77.1098 }
  }
]
```

**Query Params:**

| Param | Type | Description |
|---|---|---|
| `assigned` | boolean | Filter assigned (`true`) vs unassigned (`false`) |
| `priority` | string | Filter by priority level |
| `limit` | int | Max results (default 50) |

---

#### `GET /incidents/:id`
Returns a single incident.

---

#### `POST /incidents`
Creates a new incident (simulates "Add Random Incident" button, or real dispatch).

**Request Body:**
```json
{
  "type": "Break-in Report",
  "location": "Kuvempunagar",
  "priority": "High",
  "mapPos": { "lat": 13.335, "lng": 77.098 }
}
```
**Response 201:** Created Incident object with `time` set by server.

> **Side effect**: Server should broadcast a `incident:new` WebSocket event to all connected clients.

---

#### `PATCH /incidents/:id/assign`
Assigns an officer to an incident. This is the backend action for the **drag-and-drop** deployment.

**Request Body:**
```json
{
  "officerId": 2
}
```

**Business Logic:**
1. Verify officer exists and `status === 'available'`. Return 400 if not.
2. Set `incident.assignedOfficerId = officerId`, `incident.assignedTo = officer.name`.
3. Set `officer.status = 'assigned'`.
4. Auto-create a Duty record of type `Emergency`.
5. Broadcast `officer:status_changed` and `incident:assigned` WebSocket events.

**Response 200:** Updated Incident object.  
**Response 400:** `{ "error": "Officer is not available" }`

---

#### `PATCH /incidents/:id/resolve`
Marks an incident as resolved/closed.

**Request Body:** (empty or optional notes)  
**Response 200:** Updated Incident with `resolvedAt` set.

---

#### `DELETE /incidents/:id`
Removes an incident.

**Response 204.**

---

### 3.3 Duties

#### `GET /duties`
Returns all duty records.

**Query Params:**

| Param | Type | Description |
|---|---|---|
| `completed` | boolean | Filter by completion status |
| `officerId` | int | Filter by officer |
| `type` | string | Filter by duty type |

**Response 200:**
```json
[
  {
    "id": 1,
    "type": "Patrol",
    "officerId": 3,
    "officerName": "Ramesh Gowda",
    "location": "M G Road",
    "details": "Monitor suspicious activity.",
    "priority": "Medium",
    "createdAt": "2026-04-30T08:00:00Z",
    "completedAt": null,
    "completed": false
  }
]
```

---

#### `POST /duties`
Creates a new duty assignment ("Deploy Officer" form submission).

**Request Body:**
```json
{
  "type": "Patrol",
  "officerId": 2,
  "location": "BH Road",
  "details": "Evening patrol sweep.",
  "priority": "Medium"
}
```

**Business Logic:**
1. Validate officer exists and `status === 'available'`.
2. Set `officer.status = 'assigned'`.
3. Create duty with `createdAt = now`, `completed = false`.
4. Broadcast `officer:status_changed` WebSocket event.

**Response 201:** Created Duty object.

---

#### `PATCH /duties/:id`
Edits an existing duty (type, location, priority).

**Request Body:**
```json
{
  "type": "Investigation",
  "location": "SIT Extension",
  "priority": "High"
}
```
**Response 200:** Updated Duty object.

---

#### `PATCH /duties/:id/complete`
Marks a duty as completed.

**Business Logic:**
1. Set `duty.completed = true`, `duty.completedAt = now`.
2. Set `officer.status = 'available'`, `officer.lastSeen = now`.
3. Broadcast `officer:status_changed` WebSocket event.

**Response 200:** Updated Duty object.

---

#### `DELETE /duties/:id`
Deletes a duty and returns the officer to `available` status.

**Response 204.**

---

### 3.4 Alerts

#### `GET /alerts`
Returns all command center alerts, newest first.

**Response 200:**
```json
[
  {
    "id": 1,
    "type": "critical",
    "icon": "fa-triangle-exclamation",
    "title": "Code Red: Armed Suspect",
    "desc": "Suspect armed with firearm...",
    "time": "2026-04-30T19:41:00Z"
  }
]
```

---

#### `POST /alerts`
Creates a new alert and broadcasts it to all connected dashboard clients.

**Request Body:**
```json
{
  "type": "critical",
  "icon": "fa-triangle-exclamation",
  "title": "New Alert Title",
  "desc": "Description of the alert."
}
```
**Response 201:** Created Alert object.

---

### 3.5 Stats (Dashboard Stats Bar)

#### `GET /stats`
Returns the live summary numbers shown in the top Stats Bar.

**Response 200:**
```json
{
  "activeDuties": 4,
  "officersAvailable": 14,
  "officersDeployed": 4,
  "completedToday": 7,
  "totalIncidents": 10
}
```

> Computed by querying Duties and Officers tables.

---

## 4. Analytics Aggregation Requirements

The `analytics.html` page consumes the following aggregated data. These should be served via dedicated analytics endpoints.

---

### 4.1 KPI Summary

#### `GET /analytics/kpi`

**Response 200:**
```json
{
  "totalIncidentsMTD": 482,
  "totalIncidentsMTDTrend": -12,
  "avgResponseTimeMin": 6.4,
  "avgResponseTimeTrend": 8,
  "criticalIncidentsToday": 18,
  "criticalTrendFromYesterday": -3,
  "dutyCompletionRate": 94,
  "dutyCompletionTrend": 2
}
```

| Field | Source |
|---|---|
| `totalIncidentsMTD` | `COUNT(incidents)` where month = current month |
| `totalIncidentsMTDTrend` | % change vs previous month |
| `avgResponseTimeMin` | `AVG(duty.completedAt - incident.time)` in minutes |
| `criticalIncidentsToday` | `COUNT(incidents WHERE priority='Critical' AND DATE=today)` |
| `dutyCompletionRate` | `completed / total * 100` for current week |

---

### 4.2 Crime Heatmap Data

#### `GET /analytics/heatmap`

Returns a 2D matrix of normalized incident intensity: **8 sectors × 12 months**.

**Response 200:**
```json
{
  "sectors": ["N", "NE", "E", "SE", "S", "SW", "W", "NW"],
  "months": ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],
  "data": [
    [0.12, 0.45, 0.78, 0.33, 0.90, 0.55, 0.21, 0.66, 0.44, 0.88, 0.32, 0.71],
    ...
  ]
}
```

> `data[rowIndex][colIndex]` = normalized value `0.0–1.0` representing incident density for that sector-month combination.  
> Compute as `incidentCount / maxIncidentCountAcrossAllCells`.

---

### 4.3 Response Time Gauge

#### `GET /analytics/response-time`

**Response 200:**
```json
{
  "avgMin": 6.4,
  "bestMin": 3.1,
  "worstMin": 14.2,
  "byShift": [
    { "shift": "Morning (06-14)", "avgMin": 5.2, "load": "Normal" },
    { "shift": "Afternoon (14-22)", "avgMin": 7.8, "load": "High" },
    { "shift": "Night (22-06)", "avgMin": 4.9, "load": "Low" }
  ]
}
```

> **Shift load** categories: `Low` (<30 incidents), `Normal` (30–60), `High` (>60) — adjust thresholds to your data volume.

---

### 4.4 Incidents by Day of Week

#### `GET /analytics/incidents-by-day`

**Response 200:**
```json
[
  { "label": "Mon", "val": 65 },
  { "label": "Tue", "val": 82 },
  { "label": "Wed", "val": 78 },
  { "label": "Thu", "val": 92 },
  { "label": "Fri", "val": 115 },
  { "label": "Sat", "val": 105 },
  { "label": "Sun", "val": 58 }
]
```

> Aggregate `COUNT(incidents)` grouped by `DAYOFWEEK(time)` for the current month.

---

### 4.5 Incidents by Type

#### `GET /analytics/incidents-by-type`

**Response 200:**
```json
[
  { "label": "Patrol", "val": 78 },
  { "label": "Invest", "val": 42 },
  { "label": "Traffic", "val": 55 },
  { "label": "Desk", "val": 30 },
  { "label": "Emer", "val": 22 }
]
```

> Aggregate `COUNT(duties)` grouped by `type`.

---

### 4.6 Officers Deployed per Day

#### `GET /analytics/officers-deployed`

**Response 200:**
```json
[
  { "label": "Mon", "val": 34 },
  { "label": "Tue", "val": 38 },
  ...
]
```

> `COUNT(DISTINCT officerId)` from duties created per day of week.

---

### 4.7 Priority Distribution (Donut Chart)

#### `GET /analytics/priority-distribution`

**Response 200:**
```json
{
  "total": 482,
  "distribution": [
    { "priority": "Critical", "count": 120, "percent": 25 },
    { "priority": "High", "count": 96, "percent": 20 },
    { "priority": "Medium", "count": 145, "percent": 30 },
    { "priority": "Low", "count": 121, "percent": 25 }
  ]
}
```

---

### 4.8 Officer Performance Leaderboard

#### `GET /analytics/officer-performance`

**Response 200:**
```json
[
  {
    "rank": 1,
    "name": "Ananya Patel",
    "dutiesCompleted": 54,
    "avgResponseMin": 4.1,
    "rating": 98
  },
  ...
]
```

> Ordered by `rating DESC`. Rating algorithm: `(1 - avgResponseMin/targetMin) * 0.5 + (completedDuties/totalDuties) * 0.5 * 100` (customize as needed).

---

## 5. Real-Time Events (WebSocket)

The frontend's LIVE badge and auto-updating stats require real-time push. Use **WebSocket** (`ws://`) or **Socket.IO**.

### WebSocket Endpoint
```
ws://your-server/ws
```

### Events (Server → Client)

| Event Name | Payload | Triggered By |
|---|---|---|
| `incident:new` | Full Incident object | `POST /incidents` |
| `incident:assigned` | `{ incidentId, officerId, officerName }` | `PATCH /incidents/:id/assign` |
| `incident:resolved` | `{ incidentId }` | `PATCH /incidents/:id/resolve` |
| `officer:status_changed` | `{ officerId, status, lastSeen }` | Any status-changing action |
| `duty:created` | Full Duty object | `POST /duties` |
| `duty:completed` | `{ dutyId, officerId }` | `PATCH /duties/:id/complete` |
| `duty:deleted` | `{ dutyId }` | `DELETE /duties/:id` |
| `alert:new` | Full Alert object | `POST /alerts` |
| `stats:update` | Stats object (same as `GET /stats`) | After any state-changing operation |

### Events (Client → Server)

| Event Name | Payload | Purpose |
|---|---|---|
| `ping` | — | Heartbeat |
| `subscribe` | `{ rooms: ["incidents","officers"] }` | Room-based subscriptions (optional) |

---

## 6. Authentication & Authorization

The frontend does not yet include a login screen, but the backend should be secured from day one.

### Recommended Approach: JWT Bearer Token

```
Authorization: Bearer <token>
```

### Roles

| Role | Permissions |
|---|---|
| `admin` | Full CRUD on all resources |
| `dispatcher` | Create/assign incidents and duties; read officers |
| `officer` | Read-only on own duties; PATCH own status/location |
| `analyst` | Read-only on all analytics endpoints |

### Endpoints by Role

| Method & Path | Minimum Role |
|---|---|
| `GET /officers` | `officer` |
| `POST /officers` | `admin` |
| `PATCH /officers/:id` | `dispatcher` (others), `officer` (self) |
| `GET /incidents` | `officer` |
| `POST /incidents` | `dispatcher` |
| `PATCH /incidents/:id/assign` | `dispatcher` |
| `POST /duties` | `dispatcher` |
| `PATCH /duties/:id/complete` | `dispatcher` |
| `GET /analytics/*` | `analyst` |
| `POST /alerts` | `admin`, `dispatcher` |

---

## 7. Recommended Tech Stack

Choose based on your team's strengths. Two recommended options:

### Option A — Python / FastAPI (recommended for quick start)

| Layer | Technology |
|---|---|
| Framework | FastAPI |
| Database | PostgreSQL |
| ORM | SQLAlchemy 2.x + Alembic (migrations) |
| Real-Time | `fastapi-websocket` or `websockets` library |
| Auth | `python-jose` (JWT) + `passlib` (bcrypt) |
| Validation | Pydantic v2 (built into FastAPI) |
| Server | Uvicorn |

```
pip install fastapi uvicorn sqlalchemy alembic psycopg2-binary python-jose passlib websockets
```

**Project structure:**
```
backend/
  main.py
  routers/
    officers.py
    incidents.py
    duties.py
    alerts.py
    analytics.py
    ws.py
  models/
    officer.py
    incident.py
    duty.py
    alert.py
  schemas/
    officer.py
    incident.py
    ...
  db.py
  auth.py
  alembic/
```

---

### Option B — Node.js / Express

| Layer | Technology |
|---|---|
| Framework | Express.js |
| Database | PostgreSQL |
| ORM | Prisma |
| Real-Time | `ws` or `socket.io` |
| Auth | `jsonwebtoken` + `bcrypt` |
| Validation | `zod` |

```
npm install express prisma @prisma/client ws jsonwebtoken bcrypt zod
```

---

## 8. Environment Variables & Configuration

```env
# Server
PORT=8000
NODE_ENV=development

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/politech

# Auth
JWT_SECRET=your_super_secret_key_here
JWT_EXPIRY=8h

# Google Maps (server-side geocoding if needed)
GOOGLE_MAPS_API_KEY=your_key_here

# WebSocket
WS_HEARTBEAT_INTERVAL=30000

# CORS
ALLOWED_ORIGINS=http://localhost:3000,https://your-production-domain.com
```

---

## 9. Database Schema (SQL Reference)

```sql
-- Officers
CREATE TABLE officers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    rank VARCHAR(50) NOT NULL,
    badge VARCHAR(20) UNIQUE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'available'
        CHECK (status IN ('available', 'assigned', 'offduty')),
    last_seen TIMESTAMPTZ,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Incidents
CREATE TABLE incidents (
    id SERIAL PRIMARY KEY,
    type VARCHAR(100) NOT NULL,
    location VARCHAR(200) NOT NULL,
    priority VARCHAR(20) NOT NULL
        CHECK (priority IN ('Low', 'Medium', 'High', 'Critical')),
    time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    assigned_officer_id INTEGER REFERENCES officers(id) ON DELETE SET NULL,
    assigned_to VARCHAR(100),
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Duties
CREATE TABLE duties (
    id SERIAL PRIMARY KEY,
    type VARCHAR(30) NOT NULL
        CHECK (type IN ('Patrol', 'Investigation', 'Traffic', 'Desk', 'Emergency')),
    officer_id INTEGER NOT NULL REFERENCES officers(id) ON DELETE CASCADE,
    officer_name VARCHAR(100),
    location VARCHAR(200) NOT NULL,
    details TEXT,
    priority VARCHAR(20) NOT NULL
        CHECK (priority IN ('Low', 'Medium', 'High', 'Critical')),
    completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Alerts
CREATE TABLE alerts (
    id SERIAL PRIMARY KEY,
    type VARCHAR(20) NOT NULL
        CHECK (type IN ('critical', 'warning', 'info')),
    icon VARCHAR(60),
    title VARCHAR(150) NOT NULL,
    description TEXT,
    time TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_duties_officer ON duties(officer_id);
CREATE INDEX idx_incidents_priority ON incidents(priority);
CREATE INDEX idx_duties_completed ON duties(completed);
CREATE INDEX idx_incidents_time ON incidents(time);
```

---

## 10. Frontend Integration Checklist

Once the backend is running, replace the following in-memory JS arrays in `police.html`:

| Frontend Variable | Replace With |
|---|---|
| `let officers = [...]` | `GET /api/v1/officers` on page load |
| `let duties = [...]` | `GET /api/v1/duties?completed=false` |
| `let incidents = [...]` | `GET /api/v1/incidents` |
| `let alerts = [...]` | `GET /api/v1/alerts` |
| `dutyForm.onsubmit` | `POST /api/v1/duties` |
| `completeDuty(id)` | `PATCH /api/v1/duties/:id/complete` |
| `deleteDuty(id)` | `DELETE /api/v1/duties/:id` |
| `editDutyForm.onsubmit` | `PATCH /api/v1/duties/:id` |
| `dropOnIncident(e, incId)` | `PATCH /api/v1/incidents/:id/assign` |
| `addRandomIncident()` | `POST /api/v1/incidents` |

For `analytics.html`, replace all hardcoded JS chart data with API calls to:
- `GET /api/v1/analytics/kpi`
- `GET /api/v1/analytics/heatmap`
- `GET /api/v1/analytics/incidents-by-day`
- `GET /api/v1/analytics/incidents-by-type`
- `GET /api/v1/analytics/officers-deployed`
- `GET /api/v1/analytics/priority-distribution`
- `GET /api/v1/analytics/officer-performance`
- `GET /api/v1/analytics/response-time`

The **Export PDF / Export Excel** buttons should call server-side report generation:
- `GET /api/v1/reports/pdf` — returns a PDF blob
- `GET /api/v1/reports/excel` — returns an XLSX blob

---

*End of POLITECH Backend Documentation*
