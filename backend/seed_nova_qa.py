# -*- coding: utf-8 -*-
"""
seed_nova_qa.py — Seed the NOVA Q&A knowledge base with all 36 Q&A pairs.
Run: python seed_nova_qa.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv()

from db import SessionLocal, engine, Base
import models.nova_qa  # noqa: F401
from models.nova_qa import NovaQA

Base.metadata.create_all(bind=engine)
db = SessionLocal()

# Clear existing Q&A
db.query(NovaQA).delete()
db.commit()

QA_DATA = [
    # ── General ──────────────────────────────────────────────────────────────
    dict(cat="general", q="What is POLITECH?",
         a="POLITECH is a web-based Police Command Operations Center dashboard built for Tumakuru Police. It lets officers and dispatchers monitor personnel, track incidents, manage duties, and view analytics — all in real time.",
         kw="politech,system,platform,what,about,police,dashboard"),

    dict(cat="general", q="What does NOVA do?",
         a="NOVA is POLITECH's built-in AI assistant. It helps users navigate the system, explains features, answers questions about incidents and duties, and guides you through operations.",
         kw="nova,assistant,ai,chatbot,help,bot"),

    dict(cat="general", q="What are the main pages in POLITECH?",
         a="POLITECH has three main pages: the Login page for authentication, the Dashboard (police.html) for live operations, and the Analytics page for charts and performance reports.",
         kw="pages,sections,parts,login,dashboard,analytics,navigation"),

    dict(cat="general", q="What files make up POLITECH?",
         a="The key files are: login.html (login page), police.html (main dashboard), app.js (dashboard logic), analytics.html (charts), analytics.js (analytics logic), and the backend/ folder containing the FastAPI server and politech.db (SQLite database).",
         kw="files,structure,folder,html,js,backend,code"),

    dict(cat="general", q="What technology powers the POLITECH backend?",
         a="The backend runs on Python with FastAPI as the web framework and SQLite as the database. It communicates with the frontend via REST API and WebSocket.",
         kw="technology,stack,backend,python,fastapi,sqlite,framework"),

    # ── Login ─────────────────────────────────────────────────────────────────
    dict(cat="login", q="How do I log in to POLITECH?",
         a="Open login.html in your browser, enter your username and password, then click login. You can also use the Quick Login chips to fill credentials automatically. A JWT token is saved and you'll be redirected to the dashboard.",
         kw="login,log,sign,credentials,username,password,access"),

    dict(cat="login", q="What are the login credentials?",
         a="There are four accounts: admin / admin123 (full access), dispatcher / dispatch123 (manage incidents & duties), officer / officer123 (view only), analyst / analyst123 (view + analytics).",
         kw="credentials,username,password,accounts,users,login"),

    dict(cat="login", q="What is the admin account username and password?",
         a="Username: admin, Password: admin123. This account has full access to all features.",
         kw="admin,username,password,credentials,account,access"),

    dict(cat="login", q="What can a dispatcher do?",
         a="A dispatcher can manage incidents and duties — assigning officers, creating duties, and updating statuses. They cannot access system-level admin features.",
         kw="dispatcher,role,permission,access,duty,incident,assign"),

    dict(cat="login", q="What can an analyst do?",
         a="An analyst has view access to the dashboard plus full access to the Analytics page, including KPI cards, charts, and the officer performance table.",
         kw="analyst,role,permission,access,analytics,kpi,charts"),

    dict(cat="login", q="What happens after a successful login?",
         a="POLITECH saves a JWT (JSON Web Token) to your browser and automatically redirects you to the main dashboard (police.html).",
         kw="login,token,jwt,redirect,dashboard,after,success"),

    # ── Dashboard ─────────────────────────────────────────────────────────────
    dict(cat="dashboard", q="What can I see on the dashboard?",
         a="The dashboard shows a Live Map of officer and incident locations, an Incident Feed with priorities, a Force Grid of officer cards, a Duty Roster, and an Alert Drawer for notifications. You can also toggle between Night Watch (dark) and Day Mode (light).",
         kw="dashboard,overview,map,incidents,officers,duties,alerts"),

    dict(cat="dashboard", q="How do I assign an officer to an incident?",
         a="Drag an Available officer card from the Force Grid and drop it onto the incident in the Incident Feed. The system will automatically update the officer's status to Assigned and create an Emergency duty.",
         kw="assign,officer,incident,drag,drop,force,grid,deploy"),

    dict(cat="dashboard", q="What is the Force Grid?",
         a="The Force Grid is a grid of officer cards showing each officer's name, rank, badge number, and current status. Available officers can be dragged onto incidents to assign them.",
         kw="force,grid,officers,cards,status,rank,badge,available"),

    dict(cat="dashboard", q="What incident priorities exist?",
         a="Incidents are classified into four priority levels: Critical, High, Medium, and Low.",
         kw="priority,incident,critical,high,medium,low,level,severity"),

    dict(cat="dashboard", q="How do I complete a duty?",
         a="In the Duty Roster section on the dashboard, find the duty you want to close and click the complete button on that duty card.",
         kw="complete,duty,finish,close,roster,done,mark"),

    dict(cat="dashboard", q="What is the Alert Drawer?",
         a="The Alert Drawer is a notification panel accessed by clicking the bell icon. It shows system alerts and important updates about officers, incidents, and duties.",
         kw="alert,drawer,notification,bell,panel,warning"),

    dict(cat="dashboard", q="Can I switch between dark and light mode?",
         a="Yes. Use the Theme Toggle button on the dashboard. Night Watch is the dark theme and Day Mode is the light theme.",
         kw="dark,light,theme,mode,toggle,night,day,switch"),

    dict(cat="dashboard", q="What does the Live Map show?",
         a="The Live Map (powered by Google Maps, centered on Tumakuru) shows the real-time locations of officers and active incidents on the map.",
         kw="map,live,location,google,real-time,officers,incidents"),

    dict(cat="dashboard", q="What is the Assign Officer button?",
         a="The Assign Officer button lets you manually assign a duty to an officer using a form, as an alternative to the drag-and-drop method.",
         kw="assign,button,officer,form,manual,duty,alternative"),

    # ── API & Backend ─────────────────────────────────────────────────────────
    dict(cat="api", q="What is the base URL for the POLITECH API?",
         a="The base URL is http://127.0.0.1:8000. Interactive API documentation is available at http://127.0.0.1:8000/docs.",
         kw="api,url,base,endpoint,docs,swagger,backend,server"),

    dict(cat="api", q="How do I log in via the API?",
         a="Send a POST request to /api/v1/auth/login with your credentials. The response returns a JWT token to use in subsequent requests.",
         kw="api,login,auth,post,token,jwt,request"),

    dict(cat="api", q="Which endpoint lists all officers?",
         a="GET /api/v1/officers returns the full list of officers.",
         kw="api,officers,list,endpoint,get,fetch"),

    dict(cat="api", q="How do I assign an officer to an incident via API?",
         a="Send a PATCH request to /api/v1/incidents/{id}/assign, replacing {id} with the incident's ID.",
         kw="api,assign,incident,patch,endpoint,officer"),

    dict(cat="api", q="Which endpoint marks a duty as completed?",
         a="PATCH /api/v1/duties/{id}/complete — replace {id} with the duty's ID.",
         kw="api,duty,complete,patch,endpoint,done,finish"),

    dict(cat="api", q="What analytics data can I get from the API?",
         a="GET /api/v1/analytics/kpi returns a summary including total incidents, average response time, critical incidents today, and completion rate.",
         kw="api,analytics,kpi,metrics,data,stats,response,time"),

    dict(cat="api", q="How do I start the backend server?",
         a="Navigate to the backend/ folder and run: python -m uvicorn main:app --reload --port 8000. Alternatively, double-click backend/start.bat on Windows.",
         kw="start,server,backend,run,uvicorn,command,bat,launch"),

    # ── Real-Time ─────────────────────────────────────────────────────────────
    dict(cat="realtime", q="How does real-time updating work in POLITECH?",
         a="POLITECH uses a WebSocket connection at ws://127.0.0.1:8000/ws. When any action happens (officer status change, new incident, duty update), all connected browsers receive an event and update instantly.",
         kw="realtime,real-time,websocket,live,update,instant,automatic"),

    dict(cat="realtime", q="What WebSocket events does POLITECH send?",
         a="POLITECH broadcasts: officer:status_changed (when an officer's status updates), duty:created / completed / deleted, incident:new / assigned / resolved, and a heartbeat event every 30 seconds to keep the connection alive.",
         kw="websocket,events,broadcast,officer,duty,incident,heartbeat"),

    dict(cat="realtime", q="What happens when I assign an officer via drag and drop?",
         a="The backend sets the officer's status to Assigned, auto-creates an Emergency duty, and broadcasts events to all connected browsers so every user sees the update immediately.",
         kw="drag,drop,assign,status,duty,broadcast,update,real-time"),

    dict(cat="realtime", q="What is the heartbeat event?",
         a="The heartbeat is a keep-alive signal sent every 30 seconds over the WebSocket to ensure the connection between the browser and server stays active.",
         kw="heartbeat,keep-alive,websocket,connection,30,seconds,ping"),

    # ── Sharing ───────────────────────────────────────────────────────────────
    dict(cat="sharing", q="How can I share POLITECH for a demo?",
         a="For demos without needing a backend, use Demo Mode — it runs entirely in the browser. For temporary live sharing, run ngrok http 8000 to create a public tunnel. For permanent access, deploy the backend to a cloud platform like Render or Railway.",
         kw="share,demo,ngrok,deploy,public,access,tunnel,render"),

    dict(cat="sharing", q="What is ngrok and how do I use it with POLITECH?",
         a="ngrok is a tool that creates a temporary public URL for your local server. Run ngrok http 8000 in a terminal and share the generated URL so others can access your POLITECH instance over the internet.",
         kw="ngrok,tunnel,public,url,share,internet,local,server"),

    # ── Troubleshoot ──────────────────────────────────────────────────────────
    dict(cat="troubleshoot", q="The dashboard is not loading data. What should I check?",
         a="Make sure the backend server is running at http://127.0.0.1:8000. Check that you ran pip install -r requirements.txt in the backend/ folder. Also verify you're logged in with a valid JWT token.",
         kw="not loading,error,data,backend,server,fix,troubleshoot,problem"),

    dict(cat="troubleshoot", q="Real-time updates are not working. What could be wrong?",
         a="Check that the WebSocket connection to ws://127.0.0.1:8000/ws is not blocked by a firewall or proxy. Ensure the backend server is running and that your browser supports WebSockets.",
         kw="realtime,websocket,not working,updates,fix,firewall,problem"),

    dict(cat="troubleshoot", q="I forgot my login credentials. What are they?",
         a="Default credentials are: admin/admin123, dispatcher/dispatch123, officer/officer123, analyst/analyst123. These are the default accounts — if they've been changed, contact your system administrator.",
         kw="forgot,credentials,password,username,login,default,accounts"),

    dict(cat="troubleshoot", q="Analytics page shows no data. Why?",
         a="The Analytics page loads data from the backend's /api/v1/analytics/kpi endpoint. Ensure the backend is running, you're logged in as analyst or admin, and the database (politech.db) has data.",
         kw="analytics,no data,empty,charts,kpi,not showing,problem"),
]

for item in QA_DATA:
    entry = NovaQA(
        category=item["cat"],
        question=item["q"],
        answer=item["a"],
        keywords=item["kw"],
    )
    db.add(entry)

db.commit()
db.close()

print(f"[OK] Seeded {len(QA_DATA)} NOVA Q&A pairs into the database.")
