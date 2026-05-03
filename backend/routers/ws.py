"""
routers/ws.py — WebSocket connection manager and endpoint.
"""
import os
import json
import asyncio
from datetime import datetime, timezone
from typing import Set

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from dotenv import load_dotenv

load_dotenv()

WS_HEARTBEAT_INTERVAL = int(os.getenv("WS_HEARTBEAT_INTERVAL", "30000")) / 1000  # convert ms → seconds

router = APIRouter()


class ConnectionManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)

    async def broadcast(self, event: str, payload: dict):
        """Send a structured event to all connected clients."""
        message = json.dumps({
            "event": event,
            "data": payload,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        dead = set()
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception:
                dead.add(connection)
        for d in dead:
            self.active_connections.discard(d)


# Global singleton — imported by all routers
manager = ConnectionManager()


async def broadcast_ws(event: str, payload: dict):
    """Convenience wrapper used by all routers."""
    await manager.broadcast(event, payload)


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)

    async def heartbeat():
        while True:
            await asyncio.sleep(WS_HEARTBEAT_INTERVAL)
            try:
                await websocket.send_text(json.dumps({"event": "heartbeat"}))
            except Exception:
                break

    hb_task = asyncio.create_task(heartbeat())

    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("event") == "ping":
                    await websocket.send_text(json.dumps({"event": "pong"}))
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        pass
    finally:
        hb_task.cancel()
        manager.disconnect(websocket)
