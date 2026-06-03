"""
main.py — FastAPI application entry point for POLITECH backend.
"""
import os
from datetime import datetime, timezone

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

# Import DB and models (so create_all can find them)
from db import engine, Base, SessionLocal
import models.officer   # noqa: F401
import models.incident  # noqa: F401
import models.duty      # noqa: F401
import models.alert     # noqa: F401
import models.nova_qa   # noqa: F401

# Import routers
from routers import ws, officers, incidents, duties, alerts, stats, analytics, nova
from auth import USERS_DB, LoginRequest, TokenResponse, create_access_token, verify_password
from fastapi import HTTPException, status

# ── Build the allowed origins list from env ──────────────────────────────────
ALLOWED_ORIGINS_RAW = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:5500")
ALLOWED_ORIGINS = [o.strip() for o in ALLOWED_ORIGINS_RAW.split(",")]

# ── Create FastAPI app ────────────────────────────────────────────────────────
app = FastAPI(
    title="POLITECH API",
    version="1.0",
    description="Police Command & Operations backend for POLITECH dashboard",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Startup — create tables & auto-seed NOVA Q&A ─────────────────────────────
@app.on_event("startup")
def startup_event():
    from models.nova_qa import NovaQA
    Base.metadata.create_all(bind=engine)
    print("[OK] Database tables created / verified.")

    # Auto-seed NOVA Q&A if table is empty
    db = SessionLocal()
    try:
        if db.query(NovaQA).count() == 0:
            _seed_nova_qa(db)
            print("[OK] NOVA Q&A knowledge base seeded with 36 entries.")
        else:
            print("[OK] NOVA Q&A knowledge base already populated.")
    finally:
        db.close()


def _seed_nova_qa(db):
    from models.nova_qa import NovaQA
    QA_DATA = [
        # General
        dict(category="general", question="What is POLITECH?",
             answer="POLITECH is a web-based Police Command Operations Center dashboard built for Tumakuru Police. It lets officers and dispatchers monitor personnel, track incidents, manage duties, and view analytics — all in real time.",
             keywords="politech,system,platform,what,about,police,dashboard"),
        dict(category="general", question="What does NOVA do?",
             answer="NOVA is POLITECH's built-in assistant. It helps users navigate the system, explains features, answers questions about incidents and duties, and guides you through operations.",
             keywords="nova,assistant,ai,chatbot,help,bot"),
        dict(category="general", question="What are the main pages in POLITECH?",
             answer="POLITECH has three main pages: the Login page for authentication, the Dashboard (police.html) for live operations, and the Analytics page for charts and performance reports.",
             keywords="pages,sections,parts,login,dashboard,analytics,navigation"),
        dict(category="general", question="What files make up POLITECH?",
             answer="The key files are: login.html (login page), police.html (main dashboard), app.js (dashboard logic), analytics.html (charts), analytics.js (analytics logic), and the backend/ folder containing the FastAPI server and politech.db (SQLite database).",
             keywords="files,structure,folder,html,js,backend,code"),
        dict(category="general", question="What technology powers the POLITECH backend?",
             answer="The backend runs on Python with FastAPI as the web framework and SQLite as the database. It communicates with the frontend via REST API and WebSocket.",
             keywords="technology,stack,backend,python,fastapi,sqlite,framework"),
        # Login
        dict(category="login", question="How do I log in to POLITECH?",
             answer="Open login.html in your browser, enter your username and password, then click login. You can also use the Quick Login chips to fill credentials automatically. A JWT token is saved and you'll be redirected to the dashboard.",
             keywords="login,log,sign,credentials,username,password,access"),
        dict(category="login", question="What are the login credentials?",
             answer="There are four accounts: admin / admin123 (full access), dispatcher / dispatch123 (manage incidents & duties), officer / officer123 (view only), analyst / analyst123 (view + analytics).",
             keywords="credentials,username,password,accounts,users,login"),
        dict(category="login", question="What is the admin account username and password?",
             answer="Username: admin, Password: admin123. This account has full access to all features.",
             keywords="admin,username,password,credentials,account,access"),
        dict(category="login", question="What can a dispatcher do?",
             answer="A dispatcher can manage incidents and duties — assigning officers, creating duties, and updating statuses. They cannot access system-level admin features.",
             keywords="dispatcher,role,permission,access,duty,incident,assign"),
        dict(category="login", question="What can an analyst do?",
             answer="An analyst has view access to the dashboard plus full access to the Analytics page, including KPI cards, charts, and the officer performance table.",
             keywords="analyst,role,permission,access,analytics,kpi,charts"),
        dict(category="login", question="What happens after a successful login?",
             answer="POLITECH saves a JWT (JSON Web Token) to your browser and automatically redirects you to the main dashboard (police.html).",
             keywords="login,token,jwt,redirect,dashboard,after,success"),
        # Dashboard
        dict(category="dashboard", question="What can I see on the dashboard?",
             answer="The dashboard shows a Live Map of officer and incident locations, an Incident Feed with priorities, a Force Grid of officer cards, a Duty Roster, and an Alert Drawer for notifications. You can also toggle between Night Watch (dark) and Day Mode (light).",
             keywords="dashboard,overview,map,incidents,officers,duties,alerts"),
        dict(category="dashboard", question="How do I assign an officer to an incident?",
             answer="Drag an Available officer card from the Force Grid and drop it onto the incident in the Incident Feed. The system will automatically update the officer's status to Assigned and create an Emergency duty.",
             keywords="assign,officer,incident,drag,drop,force,grid,deploy"),
        dict(category="dashboard", question="What is the Force Grid?",
             answer="The Force Grid is a grid of officer cards showing each officer's name, rank, badge number, and current status. Available officers can be dragged onto incidents to assign them.",
             keywords="force,grid,officers,cards,status,rank,badge,available"),
        dict(category="dashboard", question="What incident priorities exist?",
             answer="Incidents are classified into four priority levels: Critical, High, Medium, and Low.",
             keywords="priority,incident,critical,high,medium,low,level,severity"),
        dict(category="dashboard", question="How do I complete a duty?",
             answer="In the Duty Roster section on the dashboard, find the duty you want to close and click the complete button on that duty card.",
             keywords="complete,duty,finish,close,roster,done,mark"),
        dict(category="dashboard", question="What is the Alert Drawer?",
             answer="The Alert Drawer is a notification panel accessed by clicking the bell icon. It shows system alerts and important updates about officers, incidents, and duties.",
             keywords="alert,drawer,notification,bell,panel,warning"),
        dict(category="dashboard", question="Can I switch between dark and light mode?",
             answer="Yes. Use the Theme Toggle button on the dashboard. Night Watch is the dark theme and Day Mode is the light theme.",
             keywords="dark,light,theme,mode,toggle,night,day,switch"),
        dict(category="dashboard", question="What does the Live Map show?",
             answer="The Live Map (powered by Google Maps, centered on Tumakuru) shows the real-time locations of officers and active incidents on the map.",
             keywords="map,live,location,google,real-time,officers,incidents"),
        dict(category="dashboard", question="What is the Assign Officer button?",
             answer="The Assign Officer button lets you manually assign a duty to an officer using a form, as an alternative to the drag-and-drop method.",
             keywords="assign,button,officer,form,manual,duty,alternative"),
        # API
        dict(category="api", question="What is the base URL for the POLITECH API?",
             answer="The base URL is http://127.0.0.1:8000. Interactive API documentation is available at http://127.0.0.1:8000/docs.",
             keywords="api,url,base,endpoint,docs,swagger,backend,server"),
        dict(category="api", question="How do I log in via the API?",
             answer="Send a POST request to /api/v1/auth/login with your credentials. The response returns a JWT token to use in subsequent requests.",
             keywords="api,login,auth,post,token,jwt,request"),
        dict(category="api", question="Which endpoint lists all officers?",
             answer="GET /api/v1/officers returns the full list of officers.",
             keywords="api,officers,list,endpoint,get,fetch"),
        dict(category="api", question="How do I assign an officer to an incident via API?",
             answer="Send a PATCH request to /api/v1/incidents/{id}/assign, replacing {id} with the incident's ID.",
             keywords="api,assign,incident,patch,endpoint,officer"),
        dict(category="api", question="Which endpoint marks a duty as completed?",
             answer="PATCH /api/v1/duties/{id}/complete — replace {id} with the duty's ID.",
             keywords="api,duty,complete,patch,endpoint,done,finish"),
        dict(category="api", question="What analytics data can I get from the API?",
             answer="GET /api/v1/analytics/kpi returns a summary including total incidents, average response time, critical incidents today, and completion rate.",
             keywords="api,analytics,kpi,metrics,data,stats,response,time"),
        dict(category="api", question="How do I start the backend server?",
             answer="Navigate to the backend/ folder and run: python -m uvicorn main:app --reload --port 8000. Alternatively, double-click backend/start.bat on Windows.",
             keywords="start,server,backend,run,uvicorn,command,bat,launch"),
        # Real-time
        dict(category="realtime", question="How does real-time updating work in POLITECH?",
             answer="POLITECH uses a WebSocket connection at ws://127.0.0.1:8000/ws. When any action happens (officer status change, new incident, duty update), all connected browsers receive an event and update instantly.",
             keywords="realtime,real-time,websocket,live,update,instant,automatic"),
        dict(category="realtime", question="What WebSocket events does POLITECH send?",
             answer="POLITECH broadcasts: officer:status_changed, duty:created/completed/deleted, incident:new/assigned/resolved, and a heartbeat every 30 seconds.",
             keywords="websocket,events,broadcast,officer,duty,incident,heartbeat"),
        dict(category="realtime", question="What happens when I assign an officer via drag and drop?",
             answer="The backend sets the officer's status to Assigned, auto-creates an Emergency duty, and broadcasts events to all connected browsers so every user sees the update immediately.",
             keywords="drag,drop,assign,status,duty,broadcast,update,real-time"),
        dict(category="realtime", question="What is the heartbeat event?",
             answer="The heartbeat is a keep-alive signal sent every 30 seconds over the WebSocket to ensure the connection between the browser and server stays active.",
             keywords="heartbeat,keep-alive,websocket,connection,30,seconds,ping"),
        # Sharing
        dict(category="sharing", question="How can I share POLITECH for a demo?",
             answer="For temporary live sharing, run ngrok http 8000 to create a public tunnel. For permanent access, deploy the backend to a cloud platform like Render or Railway.",
             keywords="share,demo,ngrok,deploy,public,access,tunnel,render"),
        dict(category="sharing", question="What is ngrok and how do I use it with POLITECH?",
             answer="ngrok is a tool that creates a temporary public URL for your local server. Run ngrok http 8000 in a terminal and share the generated URL so others can access your POLITECH instance over the internet.",
             keywords="ngrok,tunnel,public,url,share,internet,local,server"),
        # Troubleshoot
        dict(category="troubleshoot", question="The dashboard is not loading data. What should I check?",
             answer="Make sure the backend server is running at http://127.0.0.1:8000. Check that you ran pip install -r requirements.txt in the backend/ folder. Also verify you're logged in with a valid JWT token.",
             keywords="not loading,error,data,backend,server,fix,troubleshoot,problem"),
        dict(category="troubleshoot", question="Real-time updates are not working. What could be wrong?",
             answer="Check that the WebSocket connection to ws://127.0.0.1:8000/ws is not blocked by a firewall or proxy. Ensure the backend server is running and that your browser supports WebSockets.",
             keywords="realtime,websocket,not working,updates,fix,firewall,problem"),
        dict(category="troubleshoot", question="I forgot my login credentials. What are they?",
             answer="Default credentials are: admin/admin123, dispatcher/dispatch123, officer/officer123, analyst/analyst123.",
             keywords="forgot,credentials,password,username,login,default,accounts"),
        dict(category="troubleshoot", question="Analytics page shows no data. Why?",
             answer="The Analytics page loads data from /api/v1/analytics/kpi. Ensure the backend is running, you're logged in as analyst or admin, and the database has data.",
             keywords="analytics,no data,empty,charts,kpi,not showing,problem"),
    ]
    for item in QA_DATA:
        db.add(NovaQA(**item))
    db.commit()


# ── Health check ─────────────────────────────────────────────────────────────
@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


# ── Auth login ────────────────────────────────────────────────────────────────
@app.post("/api/v1/auth/login", response_model=TokenResponse, tags=["Auth"])
def login(body: LoginRequest):
    user = USERS_DB.get(body.username)
    if not user or not verify_password(body.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )
    token = create_access_token({"sub": user["username"], "role": user["role"]})
    return TokenResponse(access_token=token, token_type="bearer", role=user["role"])


# ── Include all routers ───────────────────────────────────────────────────────
app.include_router(officers.router)
app.include_router(incidents.router)
app.include_router(duties.router)
app.include_router(alerts.router)
app.include_router(stats.router)
app.include_router(analytics.router)
app.include_router(nova.router)     # NOVA AI chat proxy
app.include_router(ws.router)   # WebSocket at /ws (no api/v1 prefix)
