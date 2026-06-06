"""
Enhanced WebSocket connection manager.

Channels
--------
WS /ws/live/all           — all vehicles, all events
WS /ws/live/{vehicle_id}  — single vehicle events only

The "all" route MUST be registered in main.py BEFORE the dynamic
/{vehicle_id} route so FastAPI matches it as a static path.
"""
from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from typing import Dict, List

from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

_PING_INTERVAL = 30   # seconds


class ConnectionManager:
    """
    Two-tier subscription model:
      • per-vehicle channels  — _vehicle[vehicle_id]
      • "all" channel         — _all

    broadcast_to_vehicle() sends to the matching vehicle channel AND the
    all-channel so dashboards subscribed to everything stay in sync.
    """

    def __init__(self) -> None:
        self._vehicle: Dict[str, List[WebSocket]] = defaultdict(list)
        self._all:     List[WebSocket] = []

    # ── Connection management ─────────────────────────────────────────────────

    async def connect(self, ws: WebSocket, vehicle_id: str) -> None:
        await ws.accept()
        self._vehicle[vehicle_id].append(ws)
        logger.info("WS connected channel=%-12s  total=%d",
                    vehicle_id, self.total_connections)

    async def connect_all(self, ws: WebSocket) -> None:
        await ws.accept()
        self._all.append(ws)
        logger.info("WS connected channel=all  total=%d", self.total_connections)

    def disconnect(self, ws: WebSocket) -> None:
        for conns in self._vehicle.values():
            try: conns.remove(ws)
            except ValueError: pass
        try: self._all.remove(ws)
        except ValueError: pass
        logger.info("WS disconnected  total=%d", self.total_connections)

    # ── Broadcast ─────────────────────────────────────────────────────────────

    async def broadcast_to_vehicle(self, vehicle_id: str, data: dict) -> None:
        """Send to the vehicle's own channel + the all-channel."""
        await self._emit(self._vehicle.get(vehicle_id, []), data)
        await self._emit(self._all, data)

    async def broadcast_to_all(self, data: dict) -> None:
        """Send to every connected client across all channels."""
        for conns in self._vehicle.values():
            await self._emit(conns, data)
        await self._emit(self._all, data)

    async def send_to(self, ws: WebSocket, data: dict) -> None:
        try:
            await ws.send_json(data)
        except Exception:
            self.disconnect(ws)

    async def _emit(self, conns: List[WebSocket], data: dict) -> None:
        dead: List[WebSocket] = []
        for ws in list(conns):
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    # ── Stats ─────────────────────────────────────────────────────────────────

    @property
    def total_connections(self) -> int:
        return sum(len(v) for v in self._vehicle.values()) + len(self._all)

    def channel_summary(self) -> dict:
        return {
            vid: len(conns)
            for vid, conns in self._vehicle.items()
            if conns
        } | {"all": len(self._all)}


# ── Module-level singleton ────────────────────────────────────────────────────
manager = ConnectionManager()


# ── Per-connection keep-alive ─────────────────────────────────────────────────

async def _keep_alive(ws: WebSocket) -> None:
    while True:
        await asyncio.sleep(_PING_INTERVAL)
        try:
            await ws.send_json({"type": "ping"})
        except Exception:
            break


# ── Reusable connection loop ──────────────────────────────────────────────────

async def _connection_loop(ws: WebSocket, channel: str) -> None:
    """
    Runs after handshake — listens for client messages and keeps the
    connection alive.  Handles WebSocketDisconnect + any other exception.
    """
    ping_task = asyncio.create_task(_keep_alive(ws))
    try:
        await manager.send_to(ws, {
            "type":              "connected",
            "channel":           channel,
            "total_connections": manager.total_connections,
        })
        while True:
            msg = await ws.receive_json()
            t   = msg.get("type")
            if t == "ping":
                await manager.send_to(ws, {"type": "pong"})
            elif t == "pong":
                pass    # response to our keep-alive ping
    except (WebSocketDisconnect, RuntimeError):
        pass
    except Exception as exc:
        logger.debug("WS loop error on channel=%s: %s", channel, exc)
    finally:
        ping_task.cancel()
        manager.disconnect(ws)


# ── Endpoint handlers (registered in main.py) ─────────────────────────────────

async def ws_all_handler(ws: WebSocket) -> None:
    await manager.connect_all(ws)
    await _connection_loop(ws, "all")


async def ws_vehicle_handler(ws: WebSocket, vehicle_id: str) -> None:
    await manager.connect(ws, vehicle_id)
    await _connection_loop(ws, vehicle_id)
