# AutoSense — Vehicle ECU Simulation & AI Anomaly Detection

A full-stack, real-time vehicle health monitoring system. A C++ ECU simulator streams sensor data over UDP to a Python edge-AI pipeline, which runs dual-model anomaly detection (IsolationForest + LSTM) and forwards results to a FastAPI backend. A React dashboard displays live vehicle telemetry, anomalies, and maintenance records — all updated in real time via WebSocket.

---

## Architecture

```
┌─────────────────┐   UDP (9000)   ┌──────────────────────┐   HTTP POST   ┌─────────────────────┐
│  C++ ECU        │ ─────────────► │  Python Edge-AI       │ ────────────► │  FastAPI Backend    │
│  Simulator      │                │  • UDP receiver        │               │  • PostgreSQL        │
│  (per vehicle)  │                │  • IsolationForest     │               │  • Redis             │
│                 │                │  • LSTM autoencoder    │               │  • WebSocket hub     │
│  Sensors:       │                │  • Anomaly scoring     │               │  • Alert service     │
│  RPM, Speed,    │                │  • HTTP forwarding     │               │    (Email + SMS)     │
│  Temp, Throttle │                └──────────────────────┘               └──────────┬──────────┘
│  Battery +      │                                                                   │ WS
│  type-specific  │                                                         ┌─────────▼──────────┐
└─────────────────┘                                                         │  React Dashboard    │
                                                                            │  Vite + Tailwind    │
                                                                            └────────────────────┘
```

### Components

| Layer | Tech | Role |
|-------|------|------|
| **ECU Simulator** | C++17, CMake | Generates realistic sensor readings for 10 vehicles (car, truck, bus, ambulance) at ~10 Hz over UDP |
| **Edge AI** | Python, scikit-learn, Keras | Dual-model anomaly detection; buffers packets, scores with IsolationForest + LSTM, forwards anomalies |
| **Backend** | FastAPI, SQLAlchemy async, PostgreSQL, Redis | REST API + WebSocket; persists readings/anomalies; alert dispatch |
| **Frontend** | React 18, Vite, TailwindCSS v4, Recharts | Real-time dashboard with live charts, anomaly management, map |

---

## Features

### Live Telemetry
- Real-time sensor streaming for up to 10 simultaneous vehicles over WebSocket
- Per-vehicle live charts for RPM, speed, temperature, throttle, and battery voltage
- Vehicle type indicators (🚗 Car / 🚛 Truck / 🚌 Bus / 🚑 Ambulance) with type-specific sensors (fuel level, load weight, door status, siren)
- Vehicle health gauge showing current fault state and unresolved anomaly count
- Fault-active banner with animated alert when a vehicle is in a fault state

### AI Anomaly Detection
- **IsolationForest** — unsupervised outlier detection on 5-dimensional sensor space
- **LSTM Autoencoder** — temporal sequence reconstruction error for pattern-based detection
- Three severity tiers: `warning` → `critical` → `fatal` (derived from combined model scores)
- Anomaly events stored with full sensor snapshot, model scores, vehicle state

### Alert System
- **WebSocket push** — all anomaly events broadcast to all connected dashboard clients instantly
- **Email alerts** (Gmail SMTP / aiosmtplib) — CRITICAL and FATAL anomalies trigger styled HTML emails
- **SMS alerts** (Twilio) — FATAL anomalies send an SMS notification
- **Cooldown**: 5-minute email cooldown, 15-minute SMS cooldown per vehicle to prevent alert spam
- **Deduplication**: same fault type already active on the same vehicle suppresses repeat alerts
- 3-tier audio alerts in the browser — warning beep, critical double-pulse, fatal repeating alarm
- Mute button in navbar silences audio without affecting server-side alerts

### Anomaly Management
- **Acknowledge** anomaly — mark as seen with operator name, preserves active state
- **Resolve** anomaly — record resolver name, resolution notes, optionally auto-create a maintenance log
- **Comment thread** — add investigation notes to any anomaly
- `GET /api/anomalies/active` — returns all unresolved anomalies sorted by severity (used by navbar badge)
- Vehicle status automatically downgraded after anomaly resolution (recalculates from remaining open faults)

### Vehicle Management (`/vehicles/manage`)
- Register new vehicles with ID, type, display name, and owner
- Inline edit of display name and owner — click the pencil icon on any row
- Soft-delete (deactivate) with confirmation modal — all history preserved
- Live status and last-seen time per vehicle

### Maintenance Log (`/maintenance`)
- Timeline view of all maintenance events, expandable cards showing technician, cost, linked anomaly
- Filter by vehicle and log type
- Add maintenance log with optional anomaly linking (resolves the linked anomaly atomically)
- Log types: Routine Service, Fault Resolved, Inspection, Brake Service, Tire Change, Battery Replacement, Oil Change, Software Update
- Cost-per-vehicle bar chart with total spend summary

### Live Map (`/map`)
- SVG simulation map with styled road network and named city zones
- Vehicle dots positioned via seed-deterministic placement, moving with real speed data
- Color-coded by health status — fault vehicles pulse with an animated red ring
- Direction arrow shows heading (visible when speed > 5 km/h)
- Click any dot or fleet grid tile to open a live sensor popup
- Rotating selection ring on selected vehicle
- Fleet status grid below the map with type icons and real-time speed

### Vehicle Detail (`/monitor/:vehicleId`)
- Full sensor time-series charts (seeded from DB history, extended by live WS data)
- Download Health Report button — generates a browser-printable vehicle report with maintenance history, cost breakdown, and fault summary
- Anomaly feed with acknowledge/resolve actions directly from the monitor page

### Analytics (`/analytics`)
- Fleet-wide summary: total readings, anomaly rate, active faults
- Anomaly heatmap by vehicle and fault type

### UI / UX
- **Dark / Light mode** toggle with `localStorage` persistence (CSS custom properties)
- Navbar shows live WebSocket connection status, DB health, Redis health
- Active anomaly count badge in navbar with pulsing indicator
- Smooth slide-in animations for new anomaly feed entries
- Responsive grid layout — works on laptop and wider screens

---

## Getting Started

### Prerequisites

- **PostgreSQL 15+** running locally or via Docker
- **Redis 7+** running locally or via Docker
- **Python 3.10+**
- **Node.js 18+**
- **CMake 3.20+** + a C++17 compiler (for the ECU simulator — optional for frontend/backend dev)

### 1. Clone & configure

```bash
git clone https://github.com/Annshikaa/autosense.git
cd autosense
cp .env.example .env
# Edit .env with your DB credentials and optional SMTP/Twilio settings
```

### 2. Database setup

```bash
# Create the database
psql -U postgres -c "CREATE DATABASE autosense;"
psql -U postgres -c "CREATE USER autosense WITH PASSWORD 'yourpassword';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE autosense TO autosense;"

# Run the canonical schema (creates all tables)
psql -U autosense -d autosense -f backend/database/migrations/init.sql
```

### 3. Backend

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

API docs available at `http://localhost:8000/docs`

### 4. Frontend

```bash
cd frontend
npm install
npm run dev
# Opens at http://localhost:5173
```

### 5. Edge AI

```bash
cd edge-ai
pip install -r requirements.txt   # if separate venv desired
python training/train.py          # train models on synthetic data (one-time)
python test_receiver.py           # start the UDP receiver + inference pipeline
```

### 6. ECU Simulator (C++)

```bash
cd ecu-simulator
cmake -B build
cmake --build build --config Release
./build/Release/ecu-simulator.exe   # Windows
# ./build/ecu-simulator             # Linux/Mac
```

The simulator sends packets to `127.0.0.1:9000` by default.

---

## API Reference

### Vehicles
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/vehicles` | List all vehicles |
| `POST` | `/api/vehicles/register` | Register a new vehicle |
| `PATCH` | `/api/vehicles/{id}` | Update display name / owner |
| `DELETE` | `/api/vehicles/{id}` | Soft-deactivate vehicle |

### Sensors
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/sensors/reading` | Ingest a sensor packet (edge-AI → backend) |
| `GET` | `/api/sensors/{vehicle_id}/history` | Fetch recent readings |

### Anomalies
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/anomalies` | Create anomaly event (triggers alerts) |
| `GET` | `/api/anomalies` | List anomalies with filters |
| `GET` | `/api/anomalies/active` | All unresolved anomalies sorted by severity |
| `GET` | `/api/anomalies/{id}` | Single anomaly detail |
| `PATCH` | `/api/anomalies/{id}/acknowledge` | Acknowledge with operator name |
| `PATCH` | `/api/anomalies/{id}/resolve` | Resolve with notes + optional maintenance log |
| `POST` | `/api/anomalies/{id}/comment` | Add a comment to an anomaly |

### Maintenance
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/maintenance` | Create maintenance log |
| `GET` | `/api/maintenance` | List logs (filter by vehicle, type) |
| `GET` | `/api/maintenance/{vehicle_id}/summary` | Cost & type breakdown |
| `GET` | `/api/maintenance/export/{vehicle_id}` | Full export for PDF report |

### Analytics & Health
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/analytics/summary` | Fleet-wide aggregates |
| `GET` | `/api/analytics/heatmap` | Anomaly heatmap data |
| `GET` | `/health` | Service health (DB + Redis) |
| `WS` | `/ws` | WebSocket feed (sensor readings + anomaly events) |

---

## Project Structure

```
autosense/
├── backend/
│   ├── main.py                     # FastAPI app, router registration
│   ├── requirements.txt
│   ├── api/
│   │   ├── routes/
│   │   │   ├── sensors.py
│   │   │   ├── anomalies.py        # Full anomaly lifecycle
│   │   │   ├── vehicles.py
│   │   │   ├── maintenance.py
│   │   │   └── analytics.py
│   │   ├── websocket.py            # /ws endpoint
│   │   └── websocket_manager.py    # Connection pool + broadcast
│   ├── database/
│   │   ├── models.py               # SQLAlchemy ORM models
│   │   ├── connection.py           # Async engine + session factory
│   │   └── migrations/
│   │       ├── init.sql            # Canonical schema (run this)
│   │       ├── v3_alert_status.sql
│   │       └── v4_anomaly_management.sql
│   ├── models/
│   │   └── schemas.py              # Pydantic v2 request/response models
│   └── services/
│       ├── alert_service.py        # Email (aiosmtplib) + SMS (Twilio)
│       └── notification_rules.py   # Dispatch logic, cooldowns, dedup
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── index.css               # CSS vars, dark/light themes
│   │   ├── context/
│   │   │   ├── ThemeContext.jsx    # Dark/light toggle + localStorage
│   │   │   └── WebSocketContext.jsx # Live data, sounds, mute
│   │   ├── pages/
│   │   │   ├── Overview.jsx        # Fleet overview dashboard
│   │   │   ├── LiveMonitor.jsx     # Per-vehicle detail + PDF export
│   │   │   ├── AnomalyHistory.jsx  # Anomaly log with filters
│   │   │   ├── Analytics.jsx       # Fleet analytics + heatmap
│   │   │   ├── VehicleManage.jsx   # Vehicle CRUD
│   │   │   ├── Maintenance.jsx     # Maintenance timeline
│   │   │   └── LiveMap.jsx         # Simulated live map
│   │   ├── components/
│   │   │   ├── layout/Navbar.jsx
│   │   │   ├── dashboard/
│   │   │   │   ├── VehicleCard.jsx # Live card with type config
│   │   │   │   └── AnomalyFeed.jsx # Feed with ack/resolve modals
│   │   │   ├── charts/
│   │   │   │   ├── SensorLineChart.jsx
│   │   │   │   └── VehicleHealthGauge.jsx
│   │   │   └── ui/
│   │   │       ├── Modal.jsx       # Generic modal + sub-components
│   │   │       ├── Badge.jsx
│   │   │       ├── Card.jsx
│   │   │       └── LoadingSpinner.jsx
│   │   ├── hooks/
│   │   │   ├── useAnomalies.js
│   │   │   └── useWebSocket.js
│   │   └── services/
│   │       └── api.js              # Axios wrapper for all endpoints
│   └── package.json
│
├── edge-ai/
│   ├── training/train.py           # Train IsolationForest + LSTM
│   ├── models/
│   │   ├── isolation_forest.py
│   │   └── lstm_model.py
│   ├── inference/
│   │   ├── anomaly_detector.py     # Combined scoring + thresholds
│   │   └── predictor.py
│   └── utils/
│       ├── udp_receiver.py         # Async UDP packet listener
│       └── data_buffer.py          # Sliding window buffer
│
├── ecu-simulator/
│   ├── main.py                     # Python orchestrator (launches C++ per vehicle)
│   ├── src/                        # C++ sensor source files
│   ├── include/                    # C++ headers
│   └── CMakeLists.txt
│
├── docker-compose.yml
├── .env.example
└── .gitignore
```

---

## WebSocket Events

All events are broadcast as JSON to every connected client.

```jsonc
// Sensor reading (every ~100ms per vehicle)
{
  "type": "sensor_reading",
  "vehicle_id": "car_01",
  "vehicle_type": "car",
  "sensors": { "rpm": 2340, "speed": 67.2, "temperature": 91.4, "throttle": 34.1, "battery": 13.2 },
  "fault_active": false,
  "fault_type": null
}

// New anomaly detected
{
  "type": "anomaly_detected",
  "anomaly_id": "uuid",
  "vehicle_id": "truck_02",
  "anomaly_type": "HIGH_TEMPERATURE",
  "severity": "critical",
  "if_score": -0.24,
  "lstm_error": 118.5,
  "sensor_values": { ... }
}

// Anomaly acknowledged
{ "type": "anomaly_acknowledged", "anomaly_id": "uuid", "acknowledged_by": "Alice" }

// Anomaly resolved
{ "type": "anomaly_resolved", "anomaly_id": "uuid", "resolved_by": "Bob" }
```

---

## Alert Tiers

| Severity | WebSocket | Email | SMS | Audio |
|----------|-----------|-------|-----|-------|
| `warning` | ✅ | ❌ | ❌ | Single beep (440 Hz) |
| `critical` | ✅ | ✅ (5 min cooldown) | ❌ | Double pulse (660 Hz) |
| `fatal` | ✅ | ✅ (5 min cooldown) | ✅ (15 min cooldown) | Repeating alarm (880/660 Hz) |

---

## Environment Variables

See [`.env.example`](.env.example) for all variables. Key ones:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL async connection string |
| `REDIS_URL` | Yes | Redis connection string |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASSWORD` | Optional | Gmail SMTP for email alerts |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | Optional | Twilio for SMS alerts |
| `ALERT_EMAIL_RECIPIENT` | Optional | Where email alerts are sent |
| `ALERT_SMS_RECIPIENT` | Optional | Phone number for SMS alerts |

The alert system degrades gracefully — if SMTP or Twilio vars are absent, those channels are silently skipped.

---

## Tech Stack

| | Technology |
|---|---|
| **Language** | Python 3.10+, TypeScript/JavaScript, C++17 |
| **Backend framework** | FastAPI 0.111 |
| **ORM** | SQLAlchemy 2.0 async |
| **Database** | PostgreSQL 15 |
| **Cache / pub-sub** | Redis 7 |
| **ML** | scikit-learn (IsolationForest), Keras/TensorFlow (LSTM) |
| **Email** | aiosmtplib (async SMTP) |
| **SMS** | Twilio Python SDK |
| **Frontend** | React 18, Vite 5, TailwindCSS v4 |
| **Charts** | Recharts |
| **Data fetching** | TanStack Query v5 |
| **HTTP client** | Axios |
| **Icons** | Lucide React |

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

*Built by Anshika Jain*
