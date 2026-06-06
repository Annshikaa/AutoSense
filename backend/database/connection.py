"""
PostgreSQL (async SQLAlchemy + asyncpg) and Redis connections.
All settings are read from environment variables / .env file.
"""
from __future__ import annotations

import json
import os
from typing import Any, AsyncGenerator, Optional

from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

load_dotenv()

# ── PostgreSQL ────────────────────────────────────────────────────────────────
_DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:password@localhost:5432/autosense",
)
# Upgrade plain postgresql:// → asyncpg driver
if _DB_URL.startswith("postgresql://"):
    _DB_URL = _DB_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

engine = create_async_engine(
    _DB_URL,
    echo=os.getenv("DB_ECHO", "false").lower() == "true",
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def create_tables() -> None:
    """Create all ORM-mapped tables (dev convenience; use Alembic in prod)."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency — yields a session, commits on exit, rolls back on error."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# ── Redis ─────────────────────────────────────────────────────────────────────
_REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
_REDIS_TTL = int(os.getenv("REDIS_TTL", "5"))   # seconds

_redis_pool: Optional[Any] = None


async def get_redis():
    """FastAPI dependency — returns a shared async Redis client."""
    global _redis_pool
    try:
        import redis.asyncio as aioredis  # type: ignore
    except ImportError:
        raise RuntimeError("redis package missing: pip install redis")

    if _redis_pool is None:
        _redis_pool = aioredis.from_url(
            _REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
        )
    return _redis_pool


async def close_redis() -> None:
    global _redis_pool
    if _redis_pool is not None:
        await _redis_pool.aclose()
        _redis_pool = None


# ── Redis cache helpers ───────────────────────────────────────────────────────
class RedisCache:
    """
    Thin wrapper for the two Redis access patterns used by AutoSense.

    Keys
    ----
    vehicle:{id}:latest   → JSON of latest SensorReading   TTL 5 s
    vehicle:{id}:status   → plain string status             TTL 5 s
    """

    TTL = _REDIS_TTL

    def __init__(self, client) -> None:
        self._r = client

    # ── latest reading ────────────────────────────────────────────────────────

    async def set_latest_reading(self, vehicle_id: str, data: dict) -> None:
        key = f"vehicle:{vehicle_id}:latest"
        await self._r.setex(key, self.TTL, json.dumps(data))

    async def get_latest_reading(self, vehicle_id: str) -> Optional[dict]:
        key = f"vehicle:{vehicle_id}:latest"
        raw = await self._r.get(key)
        return json.loads(raw) if raw else None

    # ── vehicle status ────────────────────────────────────────────────────────

    async def set_vehicle_status(self, vehicle_id: str, status: str) -> None:
        key = f"vehicle:{vehicle_id}:status"
        await self._r.setex(key, self.TTL, status)

    async def get_vehicle_status(self, vehicle_id: str) -> Optional[str]:
        key = f"vehicle:{vehicle_id}:status"
        return await self._r.get(key)

    # ── bulk helpers ──────────────────────────────────────────────────────────

    async def get_all_statuses(self, vehicle_ids: list[str]) -> dict[str, Optional[str]]:
        pipe = self._r.pipeline()
        for vid in vehicle_ids:
            pipe.get(f"vehicle:{vid}:status")
        results = await pipe.execute()
        return dict(zip(vehicle_ids, results))
