"""
Shared in-process state for the AutoSense backend.

Kept in a separate module to avoid circular imports between main.py and routes.
"""
from __future__ import annotations
from typing import Set

# Vehicle IDs currently included in the WS sensor broadcast loop.
# Populated from the DB at startup; mutated by /register and DELETE endpoints.
active_vehicles: Set[str] = set()
