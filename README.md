<div align="center">

```
                                      █████╗ ██╗   ██╗████████╗ ██████╗ ███████╗███████╗███╗   ██╗███████╗███████╗
                                      ██╔══██╗██║   ██║╚══██╔══╝██╔═══██╗██╔════╝██╔════╝████╗  ██║██╔════╝██╔════╝
                                      ███████║██║   ██║   ██║   ██║   ██║███████╗█████╗  ██╔██╗ ██║███████╗█████╗  
                                      ██╔══██║██║   ██║   ██║   ██║   ██║╚════██║██╔══╝  ██║╚██╗██║╚════██║██╔══╝  
                                      ██║  ██║╚██████╔╝   ██║   ╚██████╔╝███████║███████╗██║ ╚████║███████║███████╗
                                      ╚═╝  ╚═╝ ╚═════╝    ╚═╝    ╚═════╝ ╚══════╝╚══════╝╚═╝  ╚═══╝╚══════╝╚══════╝
```

### Edge AI · Vehicle Anomaly Detection · Real-Time Full Stack System

---

![C++](https://img.shields.io/badge/C++17-00599C?style=for-the-badge&logo=c%2B%2B&logoColor=white)
![Python](https://img.shields.io/badge/Python_3.10+-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React_18-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white)
![TensorFlow](https://img.shields.io/badge/TensorFlow-FF6F00?style=for-the-badge&logo=tensorflow&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)

---

> **AutoSense** is a production-grade, real-time vehicle health monitoring system.  
> A C++ ECU simulator streams live sensor telemetry over UDP to a Python edge-AI pipeline  
> running dual-model anomaly detection — which forwards results to a FastAPI backend  
> and a live React dashboard updated instantly via WebSocket.

---

</div>

## Table of Contents

- [System Architecture](#-system-architecture)
- [Project Rating](#-project-rating)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Getting Started](#-getting-started)
- [Vehicle Types](#-vehicle-types)
- [AI Models](#-ai-models)
- [API Reference](#-api-reference)
- [WebSocket Events](#-websocket-events)
- [Alert Tiers](#-alert-tiers)
- [Project Structure](#-project-structure)
- [Environment Variables](#-environment-variables)

---

## 🏗 System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           AutoSense — System Overview                           │
└─────────────────────────────────────────────────────────────────────────────────┘

  ┌──────────────────┐                ┌────────────────────────┐
  │  🔧 C++ ECU      │                │  🧠 Python Edge AI     │
  │  Simulator       │   UDP :9000    │                        │
  │                  │ ─────────────► │  • Async UDP receiver  │
  │  10 Vehicles:    │                │  • IsolationForest     │
  │  🚗 Car ×3       │                │  • LSTM Autoencoder    │
  │  🚛 Truck ×3     │                │  • Anomaly scoring     │
  │  🚌 Bus ×3       │                │  • Severity grading    │
  │  🚑 Ambulance ×1 │                │  • HTTP forwarding     │
  │                  │                └────────────┬───────────┘
  │  Sensors:        │                             │ HTTP POST
  │  RPM · Speed     │                             ▼
  │  Temp · Throttle │                ┌────────────────────────┐
  │  Battery +       │                │  ⚙️  FastAPI Backend   │
  │  type-specific   │                │                        │
  └──────────────────┘                │  • PostgreSQL (async)  │
                                      │  • Redis cache/pubsub  │
                                      │  • WebSocket hub       │
                                      │  • Email alerts (SMTP) │
                                      │  • SMS alerts (Twilio) │
                                      └────────────┬───────────┘
                                                   │ WebSocket
                                                   ▼
                                      ┌────────────────────────┐
                                      │  📊 React Dashboard    │
                                      │                        │
                                      │  • Live sensor charts  │
                                      │  • Anomaly management  │
                                      │  • Fleet live map      │
                                      │  • Maintenance logs    │
                                      │  • PDF health reports  │
                                      │  • Dark / Light mode   │
                                      └────────────────────────┘
```

### Component Summary

| Layer | Technology | Responsibility |
|-------|-----------|----------------|
| **ECU Simulator** | C++17, CMake, pthreads | Generates realistic sensor data for 10 vehicles at ~10 Hz over UDP |
| **Edge AI** | Python, scikit-learn, Keras | Dual-model anomaly detection with rolling buffer and severity scoring |
| **Backend** | FastAPI, SQLAlchemy async, PostgreSQL, Redis | REST API + WebSocket hub + alert dispatch + full persistence |
| **Frontend** | React 18, Vite, TailwindCSS v4, Recharts | Real-time dashboard with live charts, map, anomaly workflows |

---



### Domain Coverage

```
  Embedded Systems  ████████████████████  100%
  AI / ML           ████████████████░░░░   90%
  Backend Eng.      ████████████████████  100%
  Full Stack        ████████████████░░░░   90%
  DevOps            ████████████████░░░░   85%
  Real-Time Systems ████████████████████  100%
```

> This project targets roles in **SDE**, **ML Engineer**, **Embedded Software Engineer**,  
> **Backend Engineer**, and **IoT Engineer** — simultaneously.

---

## ✨ Features

### 🔴 Live Telemetry
- Real-time sensor streaming for 10 simultaneous vehicles over WebSocket
- Per-vehicle live line charts — RPM, Speed, Temperature, Throttle, Battery
- Vehicle type indicators with type-specific extra sensors
- Animated fault-active banner when a vehicle enters a fault state
- Vehicle health gauge derived from active faults + unresolved anomaly count

### 🧠 AI Anomaly Detection
- **IsolationForest** — unsupervised outlier detection on 5-dimensional sensor space
- **LSTM Autoencoder** — temporal reconstruction error for pattern-based detection
- Dual-model scoring combined into three severity tiers
- Full sensor snapshot stored with every anomaly event

```
  Normal reading   →  IF score > -0.2   +  LSTM error < 10     →  ✅ Normal
  Warning          →  IF score < -0.4   OR  LSTM error > 30     →  ⚠️  Warning
  Critical         →  IF score < -0.6   +  LSTM error > 80     →  🔴 Critical
  Fatal            →  IF score < -0.8   +  LSTM error > 150    →  💀 Fatal
```

### 🔔 Alert System
- **WebSocket push** — instant broadcast to all dashboard clients
- **Email (SMTP)** — styled HTML email for CRITICAL and FATAL anomalies
- **SMS (Twilio)** — text notification for FATAL anomalies only
- **Cooldown** — 5-min email cooldown, 15-min SMS cooldown per vehicle
- **Deduplication** — same active fault suppresses repeat alerts
- **3-tier audio** — warning beep → critical double pulse → fatal repeating alarm
- **Mute button** — silences browser audio without affecting server alerts

### 🛠 Anomaly Lifecycle Management
- **Acknowledge** — mark as seen with operator name, timestamp preserved
- **Resolve** — record resolver, notes, optionally auto-create maintenance log
- **Comment thread** — investigation notes on any anomaly
- Vehicle status auto-recalculates after resolution

### 🚗 Vehicle Management
- Register vehicles with ID, type, display name, owner
- Inline edit — click pencil icon on any row
- Soft-delete with confirmation — all history preserved
- Live status and last-seen timestamp per vehicle

### 🔧 Maintenance Log
- Timeline view of all maintenance events
- Log types: Routine Service, Fault Resolved, Inspection, Battery Replacement, Oil Change, and more
- Link maintenance log to anomaly — resolves it atomically
- Cost-per-vehicle bar chart with total spend summary
- Filter by vehicle and log type

### 🗺 Live Fleet Map
- SVG simulation map with road network and city zones
- Vehicle dots positioned via speed data, moving in real time
- Color-coded by health — fault vehicles pulse with animated red ring
- Direction arrow when speed > 5 km/h
- Click any dot to open a live sensor popup
- Fleet status grid below the map

### 📄 PDF Health Report
- Browser-printable vehicle report from the monitor page
- Sections: health summary, sensor stats, anomaly history, maintenance log, cost breakdown, auto-recommendations

### 🎨 UI / UX
- Dark / Light mode toggle with `localStorage` persistence
- WebSocket, DB, and Redis connection status in navbar
- Active anomaly count badge with pulsing indicator
- Smooth slide-in animations for new anomaly feed entries
- Responsive grid layout

---

## 🛠 Tech Stack

| Category | Technology | Version |
|----------|-----------|---------|
| **Embedded** | C++17, CMake | C++17 / CMake 3.20+ |
| **ML Models** | scikit-learn IsolationForest | 1.4+ |
| **Deep Learning** | Keras / TensorFlow LSTM | 2.x |
| **Backend** | FastAPI | 0.111 |
| **ORM** | SQLAlchemy async | 2.0 |
| **Database** | PostgreSQL | 15+ |
| **Cache** | Redis | 7+ |
| **Email** | aiosmtplib (async SMTP) | latest |
| **SMS** | Twilio Python SDK | latest |
| **Frontend** | React + Vite | 18 / 5 |
| **Styling** | TailwindCSS | v4 |
| **Charts** | Recharts | latest |
| **Data Fetching** | TanStack Query | v5 |
| **HTTP Client** | Axios | latest |
| **Icons** | Lucide React | latest |
| **Containerization** | Docker + Compose | latest |

---

## 🚀 Getting Started

### Prerequisites

```
✅ PostgreSQL 15+
✅ Redis 7+
✅ Python 3.10+
✅ Node.js 18+
✅ CMake 3.20+ with C++17 compiler  (ECU simulator only)
```

---

### 1 — Clone & Configure

```bash
git clone https://github.com/Annshikaa/autosense.git
cd autosense
cp .env.example .env
# Edit .env with your DB credentials and optional SMTP/Twilio settings
```

---

### 2 — Database Setup

```bash
# Create database and user
psql -U postgres -c "CREATE DATABASE autosense;"
psql -U postgres -c "CREATE USER autosense WITH PASSWORD 'yourpassword';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE autosense TO autosense;"

# Run schema migrations
psql -U autosense -d autosense -f backend/database/migrations/init.sql
```

---

### 3 — Backend

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

> Swagger UI → `http://localhost:8000/docs`

---

### 4 — Frontend

```bash
cd frontend
npm install
npm run dev
# Opens at http://localhost:5173
```

---

### 5 — Edge AI

```bash
cd edge-ai
pip install -r requirements.txt

# Train models on synthetic data (one-time setup)
python training/train.py

# Start UDP receiver + inference pipeline
python test_receiver.py
```

---

### 6 — ECU Simulator (C++)

```bash
cd ecu-simulator
cmake -B build
cmake --build build --config Release

# Windows
./build/Release/ecu-simulator.exe

# Linux / macOS
./build/ecu-simulator
```

> Simulator sends packets to `127.0.0.1:9000` by default.

---

### Run Order

```
Terminal 1  →  PostgreSQL + Redis (Docker or local)
Terminal 2  →  cd backend   && uvicorn main:app --reload --port 8000
Terminal 3  →  cd edge-ai   && python test_receiver.py
Terminal 4  →  cd frontend  && npm run dev
Terminal 5  →  cd ecu-simulator/build && ./autosense_ecu
```

---

## 🚗 Vehicle Types

| Type | ID Pattern | RPM Range | Temp Range | Extra Sensor |
|------|-----------|-----------|------------|-------------|
| 🚗 Car | `car_01` – `car_03` | 800 – 4000 | 85 – 95°C | `fuel_level` (%) |
| 🚛 Truck | `truck_01` – `truck_03` | 600 – 2500 | 90 – 105°C | `load_weight` (%) |
| 🚌 Bus | `bus_01` – `bus_03` | 700 – 3000 | 88 – 100°C | `door_status` (0/1) |
| 🚑 Ambulance | `ambulance_01` | 800 – 5000 | 85 – 95°C | `siren_active` (0/1) |

Each vehicle type has distinct fault injection probabilities:
- **Trucks** fault more on temperature (heavy load stress)
- **Buses** fault more on battery (high electrical load)
- **Ambulances** fault rarely, but severity is always CRITICAL or FATAL

---

## 🧠 AI Models

### IsolationForest
```
Input  →  [rpm, speed, temperature, throttle, battery]  (5 features)
Model  →  sklearn IsolationForest  (contamination = 0.05)
Output →  anomaly score  (-1 to 0, lower = more anomalous)
Trained on 10,000 synthetic normal readings with gaussian noise
```

### LSTM Autoencoder
```
Input  →  last 50 timesteps × 5 features  (shape: 50, 5)
Model  →  LSTM encoder → LSTM decoder → reconstruction
Output →  mean squared reconstruction error per sensor
High error = sequence doesn't match learned normal patterns
Catches gradual failures that point-based models miss
```

### Combined Severity Logic
```python
if if_score < -0.8 and lstm_error > 150:   severity = "fatal"
elif if_score < -0.6 and lstm_error > 80:  severity = "critical"
elif if_score < -0.4 or  lstm_error > 30:  severity = "warning"
else:                                       severity = "normal"
```

---

## 📡 API Reference

### Vehicles
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/vehicles` | List all vehicles with live status |
| `POST` | `/api/vehicles/register` | Register a new vehicle |
| `PATCH` | `/api/vehicles/{id}` | Update display name / owner |
| `DELETE` | `/api/vehicles/{id}` | Soft-deactivate (history preserved) |

### Sensors
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/sensors/reading` | Ingest sensor packet from edge AI |
| `GET` | `/api/sensors/{vehicle_id}/history` | Fetch recent readings |

### Anomalies
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/anomalies` | Create anomaly event (triggers alerts) |
| `GET` | `/api/anomalies` | List with filters (vehicle, severity, date) |
| `GET` | `/api/anomalies/active` | All unresolved, sorted by severity |
| `GET` | `/api/anomalies/{id}` | Single anomaly detail |
| `PATCH` | `/api/anomalies/{id}/acknowledge` | Acknowledge with operator name |
| `PATCH` | `/api/anomalies/{id}/resolve` | Resolve with notes + optional maintenance log |
| `POST` | `/api/anomalies/{id}/comment` | Add investigation comment |

### Maintenance
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/maintenance` | Create maintenance log |
| `GET` | `/api/maintenance` | List logs (filter by vehicle, type) |
| `GET` | `/api/maintenance/{vehicle_id}/summary` | Cost and type breakdown |
| `GET` | `/api/maintenance/export/{vehicle_id}` | Full export for PDF report |

### Analytics & Health
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/analytics/summary` | Fleet-wide aggregates |
| `GET` | `/api/analytics/heatmap` | Anomaly heatmap data |
| `GET` | `/health` | Service health (DB + Redis) |
| `WS` | `/ws` | WebSocket feed — sensor readings + anomaly events |

---

## 📨 WebSocket Events

All events broadcast as JSON to every connected client:

```jsonc
// 🔵 Sensor reading — every ~100ms per vehicle
{
  "type": "sensor_reading",
  "vehicle_id": "car_01",
  "vehicle_type": "car",
  "sensors": {
    "rpm": 2340, "speed": 67.2,
    "temperature": 91.4, "throttle": 34.1, "battery": 13.2
  },
  "fault_active": false,
  "fault_type": null
}

// 🔴 New anomaly detected
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

// 🟡 Anomaly acknowledged
{
  "type": "anomaly_acknowledged",
  "anomaly_id": "uuid",
  "acknowledged_by": "Alice"
}

// 🟢 Anomaly resolved
{
  "type": "anomaly_resolved",
  "anomaly_id": "uuid",
  "resolved_by": "Bob"
}
```

---

## 🚨 Alert Tiers

| Severity | WebSocket | Email | SMS | Browser Audio |
|----------|:---------:|:-----:|:---:|:-------------:|
| `warning` | ✅ | ❌ | ❌ | 🔊 Single beep — 440 Hz |
| `critical` | ✅ | ✅ 5-min cooldown | ❌ | 🔊 Double pulse — 660 Hz |
| `fatal` | ✅ | ✅ 5-min cooldown | ✅ 15-min cooldown | 🔊 Repeating alarm — 880/660 Hz |

> Alert system degrades gracefully — missing SMTP or Twilio config silently skips those channels.

---

## 📁 Project Structure

```
autosense/
│
├── 🔧 ecu-simulator/               C++ embedded layer
│   ├── src/                        Sensor + vehicle source files
│   ├── include/                    Headers
│   ├── main.py                     Python orchestrator
│   └── CMakeLists.txt
│
├── 🧠 edge-ai/                     AI / ML inference layer
│   ├── training/train.py           Train IsolationForest + LSTM
│   ├── models/
│   │   ├── isolation_forest.py
│   │   └── lstm_model.py
│   ├── inference/
│   │   ├── anomaly_detector.py     Combined scoring + thresholds
│   │   └── predictor.py
│   └── utils/
│       ├── udp_receiver.py         Async UDP packet listener
│       └── data_buffer.py          Sliding window buffer
│
├── ⚙️  backend/                    FastAPI backend
│   ├── main.py                     App entry point
│   ├── api/
│   │   ├── routes/
│   │   │   ├── sensors.py
│   │   │   ├── anomalies.py        Full anomaly lifecycle
│   │   │   ├── vehicles.py
│   │   │   ├── maintenance.py
│   │   │   └── analytics.py
│   │   ├── websocket.py            /ws endpoint
│   │   └── websocket_manager.py    Connection pool + broadcast
│   ├── database/
│   │   ├── models.py               SQLAlchemy ORM models
│   │   ├── connection.py           Async engine + sessions
│   │   └── migrations/
│   │       └── init.sql            Canonical schema
│   ├── models/
│   │   └── schemas.py              Pydantic v2 schemas
│   └── services/
│       ├── alert_service.py        Email + SMS dispatch
│       └── notification_rules.py   Cooldowns + deduplication
│
├── 📊 frontend/                    React dashboard
│   └── src/
│       ├── context/
│       │   ├── ThemeContext.jsx    Dark/light toggle
│       │   └── WebSocketContext.jsx Live data + audio
│       ├── pages/
│       │   ├── Overview.jsx        Fleet overview
│       │   ├── LiveMonitor.jsx     Per-vehicle deep dive
│       │   ├── AnomalyHistory.jsx  Full anomaly log
│       │   ├── Analytics.jsx       Charts + heatmap
│       │   ├── VehicleManage.jsx   Vehicle CRUD
│       │   ├── Maintenance.jsx     Maintenance timeline
│       │   └── LiveMap.jsx         Simulated fleet map
│       ├── components/
│       │   ├── layout/Navbar.jsx
│       │   ├── dashboard/
│       │   │   ├── VehicleCard.jsx
│       │   │   └── AnomalyFeed.jsx
│       │   ├── charts/
│       │   │   ├── SensorLineChart.jsx
│       │   │   └── VehicleHealthGauge.jsx
│       │   └── ui/
│       │       ├── Modal.jsx
│       │       ├── Badge.jsx
│       │       └── Card.jsx
│       ├── hooks/
│       │   ├── useAnomalies.js
│       │   └── useWebSocket.js
│       └── services/api.js         Axios wrapper
│
├── 🐳 docker-compose.yml
├── 📄 .env.example
└── 🔒 .gitignore
```

---

## 🔑 Environment Variables

| Variable | Required | Description |
|----------|:--------:|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL async connection string |
| `REDIS_URL` | ✅ | Redis connection string |
| `SMTP_HOST` | ⚪ | Gmail SMTP host for email alerts |
| `SMTP_USER` | ⚪ | Gmail address |
| `SMTP_PASSWORD` | ⚪ | Gmail app password |
| `TWILIO_ACCOUNT_SID` | ⚪ | Twilio account SID for SMS |
| `TWILIO_AUTH_TOKEN` | ⚪ | Twilio auth token |
| `ALERT_EMAIL_RECIPIENT` | ⚪ | Destination email for alerts |
| `ALERT_SMS_RECIPIENT` | ⚪ | Destination phone for SMS alerts |

> ✅ Required — ⚪ Optional (feature degrades gracefully if absent)

---

## 📜 License

```
MIT License — see LICENSE for details.
```

---

<div align="center">

```
Built with ❤️ by Anshika Jain
```

![Made with Python](https://img.shields.io/badge/Made%20with-Python-3776AB?style=flat-square&logo=python)
![Made with C++](https://img.shields.io/badge/Made%20with-C++-00599C?style=flat-square&logo=c%2B%2B)
![Made with React](https://img.shields.io/badge/Made%20with-React-61DAFB?style=flat-square&logo=react)

*If this project helped you, consider giving it a ⭐*

</div>
