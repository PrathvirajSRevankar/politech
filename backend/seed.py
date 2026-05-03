# -*- coding: utf-8 -*-
"""
seed.py - Seed the POLITECH database with sample data.
Run: python seed.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
load_dotenv()

from db import SessionLocal, engine, Base
import models.officer
import models.incident
import models.duty
import models.alert

from models.officer import Officer
from models.incident import Incident
from models.duty import Duty
from models.alert import Alert

# Create tables if not already present
Base.metadata.create_all(bind=engine)

db = SessionLocal()

# Clear existing data
db.query(Duty).delete()
db.query(Incident).delete()
db.query(Alert).delete()
db.query(Officer).delete()
db.commit()

now = datetime.utcnow()

# ── Officers ──────────────────────────────────────────────────────────────────
officers_data = [
    dict(name="Kiran Kumar",    rank="Sergeant",      badge="KA-7891", status="available", lat=13.3392, lng=77.1016),
    dict(name="Ananya Patel",   rank="Inspector",     badge="KA-6542", status="available", lat=13.3450, lng=77.0980),
    dict(name="Ramesh Gowda",   rank="Sr. Officer",   badge="KA-3217", status="available", lat=13.3300, lng=77.1100),
    dict(name="Priya Sharma",   rank="Officer",       badge="KA-5583", status="available", lat=13.3500, lng=77.1200),
    dict(name="Vikram Singh",   rank="Lieutenant",    badge="KA-9462", status="available", lat=13.3250, lng=77.0900),
    dict(name="Amit Deshmukh",  rank="Officer",       badge="KA-1122", status="available", lat=13.3420, lng=77.1050),
    dict(name="Sunil Shetty",   rank="Sergeant",      badge="KA-3344", status="available", lat=13.3370, lng=77.1120),
    dict(name="Neha Reddy",     rank="Sub-Inspector", badge="KA-5566", status="available", lat=13.3480, lng=77.1020),
    dict(name="Vinay Kumar",    rank="Officer",       badge="KA-7788", status="offduty",   lat=13.3510, lng=77.0850),
    dict(name="Pooja Jain",     rank="Inspector",     badge="KA-9900", status="available", lat=13.3310, lng=77.0950),
    dict(name="Arjun Rao",      rank="Officer",       badge="KA-1234", status="available", lat=13.3350, lng=77.1180),
    dict(name="Meena Iyer",     rank="Sergeant",      badge="KA-5678", status="available", lat=13.3410, lng=77.1250),
    dict(name="Suresh Naik",    rank="Officer",       badge="KA-9101", status="available", lat=13.3280, lng=77.1010),
    dict(name="Kavita Menon",   rank="Lieutenant",    badge="KA-1121", status="available", lat=13.3440, lng=77.0910),
    dict(name="Rajesh Pillai",  rank="Sr. Officer",   badge="KA-3141", status="offduty",   lat=13.3520, lng=77.1110),
    dict(name="Sneha Joshi",    rank="Officer",       badge="KA-5161", status="available", lat=13.3290, lng=77.0880),
    dict(name="Deepak Verma",   rank="Sergeant",      badge="KA-7181", status="available", lat=13.3460, lng=77.1160),
    dict(name="Aditi Rao",      rank="Officer",       badge="KA-9202", status="available", lat=13.3380, lng=77.0940),
    dict(name="Manoj Tiwari",   rank="Inspector",     badge="KA-1323", status="available", lat=13.3330, lng=77.1080),
    dict(name="Pallavi Das",    rank="Officer",       badge="KA-3454", status="available", lat=13.3550, lng=77.0970),
]

officer_objs = []
for o in officers_data:
    obj = Officer(
        name=o["name"], rank=o["rank"], badge=o["badge"],
        status=o["status"], lat=o["lat"], lng=o["lng"],
        last_seen=now,
    )
    db.add(obj)
    officer_objs.append(obj)

db.commit()
for o in officer_objs:
    db.refresh(o)

print("[OK] Inserted " + str(len(officer_objs)) + " officers")

# ── Incidents ─────────────────────────────────────────────────────────────────
incidents_data = [
    dict(type="Robbery in Progress",  location="Ashoka Road",      priority="Critical", lat=13.3381, lng=77.1098, mins=28),
    dict(type="Traffic Collision",    location="BH Road Jnc",      priority="High",     lat=13.3450, lng=77.1150, mins=32),
    dict(type="Noise Complaint",      location="SIT Extension",    priority="Low",      lat=13.3220, lng=77.1050, mins=45),
    dict(type="Suspicious Vehicle",   location="APMC Yard",        priority="Medium",   lat=13.3500, lng=77.0920, mins=16),
    dict(type="Disturbance Call",     location="Gandhinagar",      priority="Medium",   lat=13.3320, lng=77.0850, mins=10),
    dict(type="Vehicle Pursuit",      location="Ring Road",        priority="High",     lat=13.3600, lng=77.1250, mins=55),
    dict(type="Assault Report",       location="Saraswathipuram",  priority="Critical", lat=13.3280, lng=77.1150, mins=50),
    dict(type="Vandalism",            location="Batawadi",         priority="Low",      lat=13.3550, lng=77.1020, mins=45),
    dict(type="Drug Suspicion",       location="Jayanagar",        priority="High",     lat=13.3420, lng=77.1220, mins=35),
    dict(type="Break-in Report",      location="Kuvempunagar",     priority="Critical", lat=13.3350, lng=77.0980, mins=30),
]

incident_objs = []
for i in incidents_data:
    obj = Incident(
        type=i["type"], location=i["location"], priority=i["priority"],
        lat=i["lat"], lng=i["lng"],
        time=now - timedelta(minutes=i["mins"]),
    )
    db.add(obj)
    incident_objs.append(obj)

db.commit()
for i in incident_objs:
    db.refresh(i)

print("[OK] Inserted " + str(len(incident_objs)) + " incidents")

# ── Duties ────────────────────────────────────────────────────────────────────
duties_data = [
    dict(type="Patrol",        idx=2,  location="M G Road",         details="Monitor suspicious activity near city center.", priority="Medium"),
    dict(type="Traffic",       idx=6,  location="BH Road Junction",  details="Traffic control at major intersection.",         priority="High"),
    dict(type="Investigation", idx=11, location="SIT Extension",     details="Investigating complaints in residential area.",  priority="Critical"),
    dict(type="Patrol",        idx=16, location="APMC Yard",         details="Standard area sweep.",                          priority="Low"),
]

duty_objs = []
for d in duties_data:
    officer = officer_objs[d["idx"]]
    officer.status = "assigned"
    obj = Duty(
        type=d["type"],
        officer_id=officer.id,
        officer_name=officer.name,
        location=d["location"],
        details=d["details"],
        priority=d["priority"],
        completed=False,
        created_at=now - timedelta(hours=2),
    )
    db.add(obj)
    duty_objs.append(obj)

db.commit()
print("[OK] Inserted " + str(len(duty_objs)) + " duties")

# ── Alerts ────────────────────────────────────────────────────────────────────
alerts_data = [
    dict(type="critical", icon="fa-triangle-exclamation", title="Code Red: Armed Suspect",
         desc="Suspect armed with firearm reported at Railway Station. All units on alert.", mins=19),
    dict(type="warning",  icon="fa-car-burst",            title="Multi-car accident",
         desc="NH 48 - 3 vehicles involved. Medical response requested.",                   mins=32),
    dict(type="info",     icon="fa-rotate",               title="Shift Change at 20:00",
         desc="Night shift begins. Ensure all active units report status.",                 mins=60),
    dict(type="critical", icon="fa-person-running",       title="Foot pursuit ongoing",
         desc="Inspector Ananya in pursuit - APMC Yard sector, backup requested.",         mins=16),
    dict(type="info",     icon="fa-shield-halved",        title="Patrol routes updated",
         desc="New patrol sectors effective immediately. Check your assignment.",           mins=65),
]

alert_objs = []
for a in alerts_data:
    obj = Alert(
        type=a["type"], icon=a["icon"], title=a["title"],
        description=a["desc"],
        time=now - timedelta(minutes=a["mins"]),
    )
    db.add(obj)
    alert_objs.append(obj)

db.commit()
print("[OK] Inserted " + str(len(alert_objs)) + " alerts")

db.close()
print("")
print("SEED COMPLETE - POLITECH database is ready!")
print("Run: uvicorn main:app --reload --port 8000")
