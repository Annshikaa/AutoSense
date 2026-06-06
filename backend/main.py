"""
AutoSense Backend — FastAPI application entry point.

Run from inside backend/ directory:
    pip install -r requirements.txt
    uvicorn main:app --reload --port 8000
"""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert as pg_insert

import state
from api.websocket import manager as ws_manager
from api.websocket import ws_all_handler, ws_vehicle_handler
from api.routes.vehicles    import router as vehicles_router
from api.routes.sensors     import router as sensors_router
from api.routes.anomalies   import router as anomalies_router
from api.routes.analytics   import router as analytics_router
from api.routes.maintenance import router as maintenance_router
from database.connection  import (
    AsyncSessionLocal, RedisCache,
    close_redis, create_tables, get_redis,
)
from database.models import Vehicle

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

_SEED_VEHICLES = [
    "car_01", "car_02", "car_03",
    "truck_01", "truck_02", "truck_03",
    "bus_01", "bus_02", "bus_03",
    "ambulance_01",
]
_BROADCAST_INTERVAL = 0.5   # seconds between sensor pushes to WebSocket clients

# ── Background sensor broadcast ───────────────────────────────────────────────

async def _sensor_broadcast_loop() -> None:
    """
    Every 500 ms: read each vehicle's latest reading from Redis and push
    it to all subscribed WebSocket clients.
    """
    while True:
        try:
            redis  = await get_redis()
            cache  = RedisCache(redis)
            for vid in list(state.active_vehicles):
                data = await cache.get_latest_reading(vid)
                if data:
                    vtype = next(
                        (t for t in ("car", "truck", "bus", "ambulance") if vid.startswith(t)),
                        None,
                    )
                    await ws_manager.broadcast_to_vehicle(vid, {
                        "type":         "sensor_update",
                        "vehicle_id":   vid,
                        "vehicle_type": vtype,
                        "sensors":      data,
                        "ts":           datetime.now(timezone.utc).isoformat(),
                    })
        except Exception as exc:
            logger.debug("Sensor broadcast error: %s", exc)
        await asyncio.sleep(_BROADCAST_INTERVAL)


# ── Startup helpers ───────────────────────────────────────────────────────────

async def _check_db() -> str:
    try:
        async with AsyncSessionLocal() as db:
            await db.execute(text("SELECT 1"))
        return "ok"
    except Exception as exc:
        logger.warning("DB health check failed: %s", exc)
        return "error"


async def _check_redis() -> str:
    try:
        r = await get_redis()
        await r.ping()
        return "ok"
    except Exception as exc:
        logger.warning("Redis health check failed: %s", exc)
        return "error"


async def _seed_vehicles() -> None:
    """
    Ensure simulator vehicles exist in the DB, then load ALL active vehicles
    from the DB into state.active_vehicles for the broadcast loop.
    """
    async with AsyncSessionLocal() as db:
        # Upsert the default simulator vehicles
        for vid in _SEED_VEHICLES:
            vtype = next(
                (t for t in ("car", "truck", "bus", "ambulance") if vid.startswith(t)),
                None,
            )
            stmt = (
                pg_insert(Vehicle)
                .values(
                    vehicle_id   = vid,
                    vehicle_type = vtype,
                    status       = "normal",
                    is_active    = True,
                    last_seen    = datetime.now(timezone.utc),
                )
                .on_conflict_do_update(
                    index_elements=["vehicle_id"],
                    set_={
                        "last_seen":    datetime.now(timezone.utc),
                        "vehicle_type": vtype,
                        "is_active":    True,
                    },
                )
            )
            await db.execute(stmt)
        await db.commit()

        # Load ALL active vehicles (including any previously registered) into state
        from sqlalchemy import select as sa_select
        rows = (await db.execute(
            sa_select(Vehicle.vehicle_id).where(Vehicle.is_active == True)
        )).scalars().all()
        state.active_vehicles.update(rows)

    logger.info("Active vehicles in broadcast loop: %s", sorted(state.active_vehicles))


# ── Lifespan ──────────────────────────────────────────────────────────────────

_broadcast_task: asyncio.Task | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _broadcast_task

    logger.info("═══ AutoSense backend starting ═══")

    # PostgreSQL
    await create_tables()
    db_ok = await _check_db()
    logger.info("PostgreSQL: %s", db_ok)

    # Seed vehicles
    try:
        await _seed_vehicles()
    except Exception as exc:
        logger.warning("Vehicle seeding failed (DB may not be ready): %s", exc)

    # Redis
    redis_ok = await _check_redis()
    logger.info("Redis: %s", redis_ok)

    # Sensor broadcast background task
    _broadcast_task = asyncio.create_task(_sensor_broadcast_loop())
    logger.info("Sensor broadcast loop started (interval=%.1fs)", _BROADCAST_INTERVAL)

    logger.info("═══ AutoSense backend ready  — http://localhost:8000/docs ═══")
    yield

    # Shutdown
    if _broadcast_task:
        _broadcast_task.cancel()
    await close_redis()
    logger.info("═══ AutoSense backend stopped ═══")


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title       = "AutoSense API",
    description = "Real-time vehicle anomaly detection — ECU → Edge AI → Backend",
    version     = "1.0.0",
    lifespan    = lifespan,
    docs_url    = "/docs",
    redoc_url   = "/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins  = ["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
    allow_methods  = ["*"],
    allow_headers  = ["*"],
)

# ── HTTP routers ──────────────────────────────────────────────────────────────

app.include_router(vehicles_router)
app.include_router(sensors_router)
app.include_router(anomalies_router)
app.include_router(analytics_router)
app.include_router(maintenance_router)


# ── Health check ──────────────────────────────────────────────────────────────

@app.get("/health", tags=["health"])
async def health_check():
    db_status    = await _check_db()
    redis_status = await _check_redis()
    return {
        "status":       "ok" if db_status == "ok" and redis_status == "ok" else "degraded",
        "db":           db_status,
        "redis":        redis_status,
        "ws_clients":   ws_manager.total_connections,
        "ws_channels":  ws_manager.channel_summary(),
        "timestamp":    datetime.now(timezone.utc).isoformat(),
    }


# ── WebSocket endpoints ───────────────────────────────────────────────────────
# IMPORTANT: /ws/live/all must be defined BEFORE /ws/live/{vehicle_id}
# so FastAPI matches it as a static path, not a vehicle_id parameter.

@app.websocket("/ws/live/all")
async def ws_all(ws: WebSocket):
    """Subscribe to live events for ALL vehicles."""
    await ws_all_handler(ws)


@app.websocket("/ws/live/{vehicle_id}")
async def ws_vehicle(ws: WebSocket, vehicle_id: str):
    """Subscribe to live events for one specific vehicle."""
    await ws_vehicle_handler(ws, vehicle_id)


# ── Dev entrypoint ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
