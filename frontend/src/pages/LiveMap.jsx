import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Navigation2, Radio } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { getVehicles } from "../services/api";
import { useWebSocket } from "../hooks/useWebSocket";

const MAP_W = 900;
const MAP_H = 560;
const PAD   = 50;

const SPEED_SCALE = 0.014;
const TICK_MS     = 80;

const STATUS_COLOR = {
  fatal:    "#ff3366",
  critical: "#ff3366",
  warning:  "#ffaa00",
  normal:   "#00ff88",
  offline:  "#475569",
};

const TYPE_ICON  = { car: "🚗", truck: "🚛", bus: "🚌", ambulance: "🚑" };
const TYPE_COLOR = { car: "#3b82f6", truck: "#f97316", bus: "#22c55e", ambulance: "#ef4444" };

function seedPos(vehicleId) {
  let h = 0;
  for (let i = 0; i < vehicleId.length; i++) h = (h * 31 + vehicleId.charCodeAt(i)) >>> 0;
  return {
    x:   PAD + ((h % 1000) / 1000) * (MAP_W - PAD * 2),
    y:   PAD + (((h >> 10) % 1000) / 1000) * (MAP_H - PAD * 2),
    dir: ((h >> 20) % 628) / 100,
  };
}

// ── Road network ──────────────────────────────────────────────────────────────
const ROADS = [
  // horizontal arteries
  { x1: 0, y1: MAP_H * 0.22, x2: MAP_W, y2: MAP_H * 0.22, w: 14 },
  { x1: 0, y1: MAP_H * 0.55, x2: MAP_W, y2: MAP_H * 0.55, w: 14 },
  { x1: 0, y1: MAP_H * 0.82, x2: MAP_W, y2: MAP_H * 0.82, w: 9  },
  // vertical arteries
  { x1: MAP_W * 0.18, y1: 0, x2: MAP_W * 0.18, y2: MAP_H, w: 14 },
  { x1: MAP_W * 0.55, y1: 0, x2: MAP_W * 0.55, y2: MAP_H, w: 14 },
  { x1: MAP_W * 0.82, y1: 0, x2: MAP_W * 0.82, y2: MAP_H, w: 9  },
  // diagonals / connectors
  { x1: 0,   y1: MAP_H * 0.55, x2: MAP_W * 0.18, y2: MAP_H * 0.22, w: 7 },
  { x1: MAP_W * 0.55, y1: MAP_H * 0.55, x2: MAP_W * 0.82, y2: MAP_H * 0.22, w: 7 },
  { x1: MAP_W * 0.18, y1: MAP_H * 0.82, x2: MAP_W * 0.55, y2: MAP_H * 0.55, w: 7 },
];

// Named zones (city blocks)
const ZONES = [
  { x: MAP_W * 0.22, y: MAP_H * 0.08, label: "NORTH DEPOT",   w: 120, h: 30 },
  { x: MAP_W * 0.58, y: MAP_H * 0.30, label: "EAST DISTRICT",  w: 130, h: 30 },
  { x: MAP_W * 0.08, y: MAP_H * 0.60, label: "WEST HUB",       w: 100, h: 30 },
  { x: MAP_W * 0.35, y: MAP_H * 0.68, label: "CENTRAL",        w: 90,  h: 30 },
  { x: MAP_W * 0.62, y: MAP_H * 0.72, label: "SOUTH YARD",     w: 110, h: 30 },
];

function MapBackground() {
  return (
    <g>
      {/* Base dark fill */}
      <rect x={0} y={0} width={MAP_W} height={MAP_H} fill="#08080f" rx={12} />

      {/* Grid */}
      {Array.from({ length: Math.ceil(MAP_W / 60) }, (_, i) => (
        <line key={`gv${i}`} x1={i*60} y1={0} x2={i*60} y2={MAP_H} stroke="#111120" strokeWidth={1} />
      ))}
      {Array.from({ length: Math.ceil(MAP_H / 60) }, (_, i) => (
        <line key={`gh${i}`} x1={0} y1={i*60} x2={MAP_W} y2={i*60} stroke="#111120" strokeWidth={1} />
      ))}

      {/* Road base (gutter) */}
      {ROADS.map((r, i) => (
        <line key={`rb${i}`} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2}
          stroke="#1a1a2e" strokeWidth={r.w + 6} strokeLinecap="round" />
      ))}
      {/* Road surface */}
      {ROADS.map((r, i) => (
        <line key={`rs${i}`} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2}
          stroke="#1e1e35" strokeWidth={r.w} strokeLinecap="round" />
      ))}
      {/* Road center-lines */}
      {ROADS.map((r, i) => (
        <line key={`rd${i}`} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2}
          stroke="#252540" strokeWidth={1.5} strokeLinecap="round"
          strokeDasharray={r.w >= 12 ? "12 8" : "6 5"} />
      ))}

      {/* Zone labels */}
      {ZONES.map((z, i) => (
        <g key={i} transform={`translate(${z.x}, ${z.y})`}>
          <rect x={0} y={0} width={z.w} height={z.h} rx={4} fill="#12122040" stroke="#2a2a4040" strokeWidth={1} />
          <text x={z.w / 2} y={z.h / 2 + 4} textAnchor="middle" fill="#2a2a55"
            fontSize={9} fontFamily="monospace" fontWeight="bold" letterSpacing={1}>
            {z.label}
          </text>
        </g>
      ))}

      {/* Compass */}
      <g transform={`translate(${MAP_W - 44}, 26)`}>
        <circle r={14} fill="#0f0f1e" stroke="#2a2a4a" strokeWidth={1} />
        <text x={0} y={-5} textAnchor="middle" fill="#3b82f6" fontSize={8} fontWeight="bold">N</text>
        <text x={0} y={10} textAnchor="middle" fill="#334155" fontSize={7}>S</text>
        <text x={-8} y={3} textAnchor="middle" fill="#334155" fontSize={7}>W</text>
        <text x={8} y={3}  textAnchor="middle" fill="#334155" fontSize={7}>E</text>
        <line x1={0} y1={-10} x2={0} y2={-3} stroke="#3b82f6" strokeWidth={1.5} strokeLinecap="round" />
      </g>

      {/* Scale bar */}
      <g transform={`translate(16, ${MAP_H - 22})`}>
        <rect x={0} y={0} width={60} height={14} rx={3} fill="#0f0f1e" stroke="#1e1e35" strokeWidth={1} />
        <line x1={8} y1={7} x2={52} y2={7} stroke="#334155" strokeWidth={1.5} />
        <line x1={8} y1={4} x2={8} y2={10} stroke="#334155" strokeWidth={1.5} />
        <line x1={52} y1={4} x2={52} y2={10} stroke="#334155" strokeWidth={1.5} />
        <text x={30} y={6} textAnchor="middle" fill="#475569" fontSize={7} fontFamily="monospace">SIM SCALE</text>
      </g>
    </g>
  );
}

// ── Vehicle dot ───────────────────────────────────────────────────────────────
function VehicleDot({ pos, vehicle, liveData, onClick, isSelected }) {
  const status   = liveData?.fault_active ? "critical" : (vehicle?.status ?? "offline");
  const color    = STATUS_COLOR[status] ?? STATUS_COLOR.offline;
  const accent   = TYPE_COLOR[vehicle?.vehicle_type] ?? "#3b82f6";
  const isFault  = status === "critical" || status === "fatal";
  const speed    = liveData?.sensors?.speed ?? 0;
  const isMoving = speed > 5;

  return (
    <g
      transform={`translate(${pos.x.toFixed(2)}, ${pos.y.toFixed(2)})`}
      onClick={() => onClick(vehicle?.vehicle_id)}
      style={{ cursor: "pointer" }}
    >
      {/* Outer glow for fault */}
      {isFault && (
        <>
          <circle r={20} fill={color} opacity={0.04} />
          <circle r={15} fill="none" stroke={color} strokeWidth={1} opacity={0.3}>
            <animate attributeName="r" values="11;22;11" dur="1.6s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.35;0;0.35" dur="1.6s" repeatCount="indefinite" />
          </circle>
        </>
      )}

      {/* Selection ring */}
      {isSelected && (
        <circle r={15} fill="none" stroke="#ffffff" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.5}>
          <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="6s" repeatCount="indefinite" />
        </circle>
      )}

      {/* Heading arrow */}
      {isMoving && (
        <line
          x1={0} y1={0}
          x2={Math.cos(pos.dir) * 14} y2={Math.sin(pos.dir) * 14}
          stroke={color} strokeWidth={2} strokeLinecap="round" opacity={0.7}
        >
          <animate attributeName="opacity" values="0.7;0.4;0.7" dur="1.2s" repeatCount="indefinite" />
        </line>
      )}

      {/* Outer ring (type color) */}
      <circle r={9} fill={accent + "30"} stroke={accent} strokeWidth={1.2} />

      {/* Inner dot (status color) */}
      <circle r={5} fill={color} />
      <circle r={2.5} fill="#ffffff" opacity={0.4} />

      {/* Vehicle ID tag */}
      <g transform="translate(0, -16)">
        <rect
          x={-22} y={-8} width={44} height={13} rx={3}
          fill="#0a0a14" stroke={isFault ? color : "#2a2a4a"} strokeWidth={isFault ? 1.2 : 0.8}
          opacity={0.9}
        />
        <text x={0} y={1} textAnchor="middle" fill={isFault ? color : "#94a3b8"}
          fontSize={7.5} fontFamily="monospace" fontWeight={isFault ? "bold" : "normal"}>
          {vehicle?.vehicle_id}
        </text>
      </g>

      {/* Speed badge */}
      {isMoving && (
        <text x={11} y={10} fill="#64748b" fontSize={6.5} fontFamily="monospace">
          {speed.toFixed(0)}
        </text>
      )}
    </g>
  );
}

// ── Popup card ────────────────────────────────────────────────────────────────
function VehiclePopup({ vehicle, liveData, onClose }) {
  if (!vehicle) return null;
  const status  = liveData?.fault_active ? "critical" : (vehicle.status ?? "offline");
  const color   = STATUS_COLOR[status];
  const accent  = TYPE_COLOR[vehicle.vehicle_type] ?? "#3b82f6";
  const sensors = liveData?.sensors ?? {};
  const vtype   = vehicle.vehicle_type ?? "car";

  return (
    <div
      className="absolute top-3 right-3 w-56 rounded-xl overflow-hidden z-10"
      style={{ backgroundColor: "#0d0d1a", border: `1px solid ${accent}40`, boxShadow: `0 0 24px ${accent}15` }}
    >
      {/* Header stripe */}
      <div className="px-3 py-2 flex items-center justify-between" style={{ backgroundColor: accent + "18", borderBottom: `1px solid ${accent}30` }}>
        <div className="flex items-center gap-2">
          <span className="text-xl leading-none">{TYPE_ICON[vtype] ?? "🚗"}</span>
          <div>
            <p className="text-xs font-bold font-mono" style={{ color: accent }}>{vehicle.vehicle_id}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color }}>{status}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-0.5 rounded hover:bg-white/5 transition-colors" style={{ color: "#475569" }}>
          <X size={12} />
        </button>
      </div>

      <div className="px-3 py-2 space-y-1.5">
        {liveData ? (
          <>
            {/* Sensor grid */}
            <div className="grid grid-cols-2 gap-1">
              {[
                ["Speed",   sensors.speed,       "km/h"],
                ["RPM",     sensors.rpm,         "rpm" ],
                ["Temp",    sensors.temperature, "°C"  ],
                ["Throttle",sensors.throttle,    "%"   ],
                ["Battery", sensors.battery,     "V"   ],
              ].map(([label, val, unit]) => (
                <div key={label} className="rounded px-2 py-1 text-center" style={{ backgroundColor: "#12122a" }}>
                  <div className="text-[9px] uppercase tracking-wide" style={{ color: "#475569" }}>{label}</div>
                  <div className="text-[11px] font-mono font-bold" style={{ color: "#e2e8f0" }}>
                    {typeof val === "number" ? val.toFixed(1) : "—"}
                    <span style={{ color: "#334155", fontSize: 9 }}> {unit}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Fault banner */}
            {liveData.fault_active && (
              <div className="mt-1 px-2 py-1.5 rounded text-[10px] font-bold text-[#ff3366] flex items-center gap-1.5"
                style={{ backgroundColor: "#ff336615", border: "1px solid #ff336630" }}>
                <span className="w-1.5 h-1.5 rounded-full bg-[#ff3366] animate-ping inline-block shrink-0" />
                {liveData.fault_type ?? "FAULT ACTIVE"}
              </div>
            )}
          </>
        ) : (
          <p className="text-[10px] py-2 text-center" style={{ color: "#475569" }}>No live data — vehicle offline</p>
        )}

        {vehicle.last_seen && (
          <p className="text-[10px] pt-0.5" style={{ color: "#334155" }}>
            <span style={{ color: "#475569" }}>Last seen: </span>
            {formatDistanceToNow(new Date(vehicle.last_seen), { addSuffix: true })}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function LiveMap() {
  const { latestReadings: wsData } = useWebSocket();

  const { data: vehicles = [] } = useQuery({
    queryKey:       ["vehicles"],
    queryFn:         () => getVehicles(),
    refetchInterval: 30000,
  });

  const posRef = useRef({});
  const [positions, setPositions] = useState({});
  const [selected, setSelected]   = useState(null);

  useEffect(() => {
    vehicles.forEach((v) => {
      if (!posRef.current[v.vehicle_id]) {
        posRef.current[v.vehicle_id] = seedPos(v.vehicle_id);
      }
    });
    setPositions({ ...posRef.current });
  }, [vehicles]);

  useEffect(() => {
    const id = setInterval(() => {
      let changed = false;
      vehicles.forEach((v) => {
        const live  = wsData[v.vehicle_id];
        const speed = live?.sensors?.speed ?? 0;
        if (speed < 0.5) return;
        const cur = posRef.current[v.vehicle_id];
        if (!cur) return;
        let { x, y, dir } = cur;
        x += Math.cos(dir) * speed * SPEED_SCALE;
        y += Math.sin(dir) * speed * SPEED_SCALE;
        if (x < PAD || x > MAP_W - PAD) { dir = Math.PI - dir; x = Math.max(PAD, Math.min(MAP_W - PAD, x)); }
        if (y < PAD || y > MAP_H - PAD) { dir = -dir;           y = Math.max(PAD, Math.min(MAP_H - PAD, y)); }
        dir += (Math.random() - 0.5) * 0.05;
        posRef.current[v.vehicle_id] = { x, y, dir };
        changed = true;
      });
      if (changed) setPositions({ ...posRef.current });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [vehicles, wsData]);

  const selectedVehicle = vehicles.find((v) => v.vehicle_id === selected) ?? null;
  const selectedLive    = selected ? wsData[selected] : null;

  const onlineCount = vehicles.filter((v) => wsData[v.vehicle_id]).length;
  const faultCount  = vehicles.filter((v) => wsData[v.vehicle_id]?.fault_active).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-base font-bold" style={{ color: "var(--t1)" }}>
            Live Map
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--t4)" }}>
            {onlineCount} online · {" "}
            {faultCount > 0
              ? <span className="text-[#ff3366] font-semibold">{faultCount} faults active</span>
              : <span style={{ color: "var(--t4)" }}>no active faults</span>}
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 flex-wrap">
          {Object.entries(STATUS_COLOR).map(([s, c]) => (
            <span key={s} className="flex items-center gap-1 text-[11px]">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c }} />
              <span style={{ color: "var(--t4)" }}>{s}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Map SVG */}
      <div
        className="relative rounded-2xl overflow-hidden"
        style={{ border: "1px solid #1e1e35", boxShadow: "0 0 40px rgba(59,130,246,0.04)" }}
      >
        <svg
          width="100%"
          viewBox={`0 0 ${MAP_W} ${MAP_H}`}
          style={{ display: "block", maxHeight: 580 }}
          onClick={(e) => {
            const tag = e.target.tagName.toLowerCase();
            if (["svg", "rect", "line", "text"].includes(tag)) setSelected(null);
          }}
        >
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          <MapBackground />

          {vehicles.map((v) => {
            const pos = positions[v.vehicle_id];
            if (!pos) return null;
            return (
              <VehicleDot
                key={v.vehicle_id}
                pos={pos}
                vehicle={v}
                liveData={wsData[v.vehicle_id]}
                onClick={setSelected}
                isSelected={selected === v.vehicle_id}
              />
            );
          })}

          {/* Watermark */}
          <text x={14} y={MAP_H - 8} fill="#1e1e35" fontSize={9} fontFamily="monospace">
            AutoSense Simulation Map — Not to scale
          </text>
        </svg>

        <VehiclePopup vehicle={selectedVehicle} liveData={selectedLive} onClose={() => setSelected(null)} />
      </div>

      {/* Fleet grid */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ backgroundColor: "var(--bg-1)", border: "1px solid var(--bd)" }}
      >
        <div
          className="px-4 py-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--t4)", borderBottom: "1px solid var(--bd)" }}
        >
          <Radio size={11} /> Fleet Status ({vehicles.length} vehicles)
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-px" style={{ backgroundColor: "var(--bd)" }}>
          {vehicles.map((v) => {
            const live   = wsData[v.vehicle_id];
            const status = live?.fault_active ? "critical" : (live ? (v.status ?? "normal") : "offline");
            const color  = STATUS_COLOR[status];
            const accent = TYPE_COLOR[v.vehicle_type] ?? "#3b82f6";
            const speed  = live?.sensors?.speed;
            const isActive = selected === v.vehicle_id;

            return (
              <button
                key={v.vehicle_id}
                onClick={() => setSelected(v.vehicle_id === selected ? null : v.vehicle_id)}
                className="flex items-center gap-2 px-3 py-2.5 text-left transition-all"
                style={{
                  backgroundColor: isActive ? accent + "18" : "var(--bg-1)",
                  outline: isActive ? `1px solid ${accent}40` : "none",
                }}
              >
                <div className="relative shrink-0">
                  <span className="text-base leading-none">{TYPE_ICON[v.vehicle_type] ?? "🚗"}</span>
                  {status === "critical" && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#ff3366] animate-ping" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-mono font-bold truncate" style={{ color: isActive ? accent : "var(--t1)" }}>
                    {v.vehicle_id}
                  </p>
                  <p className="text-[10px]" style={{ color }}>
                    {status}
                    {typeof speed === "number" && (
                      <span style={{ color: "var(--t5)" }}> · {speed.toFixed(0)} km/h</span>
                    )}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
