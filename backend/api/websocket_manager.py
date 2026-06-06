"""
WebSocket connection manager — broadcasts anomaly events and live sensor
data to all connected dashboard clients.
"""
from __future__ import annotations

import logging
from typing import List

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: List[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._connections.append(ws)
        logger.info("WS connected  — active: %d", len(self._connections))

    def disconnect(self, ws: WebSocket) -> None:
        if ws in self._connections:
            self._connections.remove(ws)
        logger.info("WS disconnected — active: %d", len(self._connections))

    async def broadcast(self, payload: dict) -> None:
        """Send JSON to every connected client; silently drop dead connections."""
        dead: List[WebSocket] = []
        for ws in self._connections:
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    async def send_to(self, ws: WebSocket, payload: dict) -> None:
        try:
            await ws.send_json(payload)
        except Exception:
            self.disconnect(ws)

    @property
    def active_count(self) -> int:
        return len(self._connections)


# Single shared instance used by all route modules
manager = ConnectionManager()
