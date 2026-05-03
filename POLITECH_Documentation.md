# POLITECH — System Documentation
Police Command Operations Center | Tumakuru Police | v1.0

---

## What is POLITECH?

A web dashboard for police to monitor officers, incidents, and duties in real time.

---

## Files

| File | Purpose |
|---|---|
| `login.html` | Login page |
| `police.html` | Main dashboard |
| `app.js` | Dashboard logic |
| `analytics.html` | Charts & reports |
| `analytics.js` | Analytics logic |
| `backend/` | Python FastAPI server |
| `backend/politech.db` | SQLite database |

---

## How to Run

**1. Install dependencies**
```bash
cd backend
pip install -r requirements.txt
```

**2. Start the server**
```bash
python -m uvicorn main:app --reload --port 8000
```
Or double-click `backend/start.bat`

**3. Open login.html in your browser**

---

## Login Credentials

| Username | Password | Role |
|---|---|---|
| `admin` | `admin123` | Full access |
| `dispatcher` | `dispatch123` | Manage incidents & duties |
| `officer` | `officer123` | View only |
| `analyst` | `analyst123` | View + analytics |

---

## Pages

### Login Page
- Enter credentials or use Quick Login chips
- Saves JWT token and redirects to dashboard

### Dashboard (police.html)
- **Live Map** — shows officer and incident locations (Google Maps, Tumakuru)
- **Incident Feed** — list of active incidents with priority (Critical / High / Medium / Low)
- **Force Grid** — officer cards showing name, rank, status
- **Drag & Drop** — drag an available officer onto an incident to assign them
- **Duty Roster** — list active duties; complete, edit, or delete
- **Assign Officer** button — manually assign a duty via form
- **Alert Drawer** — system notifications (bell icon)
- **Theme Toggle** — Night Watch (dark) / Day Mode (light)

### Analytics Page (analytics.html)
- KPI cards: Total incidents, Avg response time, Critical today, Completion rate
- Crime heatmap, Response time gauge, Bar charts, Donut chart, Officer performance table
- Data loads from backend analytics API

---

## API (Backend)

Base URL: `http://127.0.0.1:8000`
Docs: `http://127.0.0.1:8000/docs`

| Endpoint | What it does |
|---|---|
| `POST /api/v1/auth/login` | Login, returns JWT token |
| `GET /api/v1/officers` | List all officers |
| `GET /api/v1/incidents` | List all incidents |
| `PATCH /api/v1/incidents/{id}/assign` | Assign officer to incident |
| `GET /api/v1/duties` | List all duties |
| `PATCH /api/v1/duties/{id}/complete` | Mark duty done |
| `GET /api/v1/alerts` | List alerts |
| `GET /api/v1/analytics/kpi` | Analytics summary |
| `ws://127.0.0.1:8000/ws` | WebSocket for real-time updates |

---

## How Assignment Works

1. Drag an **Available** officer card onto an incident in the feed
2. Backend sets officer status → `Assigned`
3. An Emergency duty is auto-created
4. All connected browsers update instantly via WebSocket

---

## Real-Time Events (WebSocket)

| Event | Trigger |
|---|---|
| `officer:status_changed` | Officer status updated |
| `duty:created / completed / deleted` | Duty action |
| `incident:new / assigned / resolved` | Incident action |
| `heartbeat` | Every 30 seconds (keep-alive) |

---

## Database Models

- **Officer** — name, rank, badge, status, location (lat/lng)
- **Incident** — type, location, priority, time, assigned officer
- **Duty** — type, officer, location, priority, completed flag
- **Alert** — title, description, type, time

---

## Sharing Options

| Method | Best for |
|---|---|
| **Demo Mode** (no backend) | Presentations, quick demos |
| **ngrok** (`ngrok http 8000`) | Temporary live sharing |
| **Render/Railway** (cloud deploy) | Permanent public access |

---

*POLITECH v1.0 — Internal Use Only*
