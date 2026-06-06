import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import clsx from "clsx";
import Card from "../ui/Card";
import Badge from "../ui/Badge";
import StatusIndicator from "../ui/StatusIndicator";
import VehicleHealthGauge from "../charts/VehicleHealthGauge";
import { useAnomalies } from "../../hooks/useAnomalies";

// ── Vehicle type config ────────────────────────────────────────────────────────
const TYPE_CONFIG = {
  car:       { icon: "🚗", accent: "#3b82f6", label: "Car",       extra: "fuel_level"   },
  truck:     { icon: "🚛", accent: "#f97316", label: "Truck",     extra: "load_weight"  },
  bus:       { icon: "🚌", accent: "#22c55e", label: "Bus",       extra: "door_status"  },
  ambulance: { icon: "🚑", accent: "#ef4444", label: "Ambulance", extra: "siren_active" },
};

const EXTRA_SENSOR = {
  fuel_level:   { label: "Fuel",   unit: "%",  warn: 15,  fmt: (v) => v.toFixed(1) },
  load_weight:  { label: "Load",   unit: "%",  warn: 100, fmt: (v) => v.toFixed(1) },
  door_status:  { label: "Door",   unit: "",   warn: null, fmt: (v) => v > 0.5 ? "OPEN" : "CLOSED" },
  siren_active: { label: "Siren",  unit: "",   warn: null, fmt: (v) => v > 0.5 ? "ON"   : "OFF"    },
};

const BASE_SENSORS = [
  { key: "rpm",         label: "RPM",   unit: "rpm",  warn: 6000, fmt: (v) => v.toFixed(0) },
  { key: "speed",       label: "Speed", unit: "km/h", warn: 160,  fmt: (v) => v.toFixed(1) },
  { key: "temperature", label: "Temp",  unit: "°C",   warn: 105,  fmt: (v) => v.toFixed(1) },
  { key: "throttle",    label: "Thr",   unit: "%",    warn: 95,   fmt: (v) => v.toFixed(1) },
  { key: "battery",     label: "Bat",   unit: "V",    warn: 30,   fmt: (v) => v.toFixed(2) },
];

function SensorRow({ label, value, unit, warn, fmt, accent }) {
  const over = typeof value === "number" && warn != null && value > warn;
  return (
    <div className={clsx(
      "flex items-center justify-between rounded px-2 py-0.5 text-xs transition-colors",
      over ? "bg-[#ff3366]/10" : "bg-[#0f0f17]",
    )}>
      <span className="text-[#475569] w-8 shrink-0">{label}</span>
      <span className={clsx("font-mono font-semibold tabular-nums", over ? "text-[#ff3366]" : "text-[#e2e8f0]")}>
        {typeof value === "number" ? fmt(value) : "—"}
        {unit && <span className="text-[#334155] text-[9px] ml-0.5">{unit}</span>}
      </span>
    </div>
  );
}

export default function VehicleCard({ vehicle, liveData }) {
  const navigate = useNavigate();
  const sensors  = liveData?.sensors ?? {};
  const fault    = liveData?.fault_active ?? false;
  const vid      = vehicle?.vehicle_id ?? "";
  const hasLive  = liveData != null;

  // Determine vehicle type (from live data > vehicle record > heuristic)
  const vtype = (liveData?.vehicle_type ?? vehicle?.vehicle_type ?? "").toLowerCase();
  const typeConfig = TYPE_CONFIG[vtype] ?? TYPE_CONFIG.car;
  const accent = typeConfig.accent;

  const { data: recentAnomalies = [] } = useAnomalies({ vehicle_id: vid, limit: 20 });
  const unresolvedCount = recentAnomalies.filter((a) => !a.resolved).length;
  const lastAnomaly     = recentAnomalies[0];

  const displayStatus = !hasLive ? "offline"
    : fault            ? "critical"
    : unresolvedCount > 0 ? "warning"
    : "normal";

  // Extra sensor key + value
  const extraKey  = typeConfig.extra;
  const extraVal  = sensors[extraKey];
  const extraConf = EXTRA_SENSOR[extraKey];

  const borderColor = fault ? "#ff3366"
    : !hasLive       ? "#1e1e2e"
    :                  accent + "35";

  const glowStyle = fault
    ? { boxShadow: "0 0 16px rgba(255,51,102,0.12)" }
    : hasLive
    ? { boxShadow: `0 0 12px ${accent}08` }
    : {};

  return (
    <div
      onClick={() => navigate(`/monitor/${vid}`)}
      className={clsx(
        "relative rounded-xl border bg-[#12121a] p-4 cursor-pointer transition-all duration-300 hover:brightness-110",
        fault && "animate-pulse-border",
        !hasLive && "opacity-50",
      )}
      style={{ borderColor, ...glowStyle }}
    >
      {/* Active fault banner */}
      {fault && (
        <div className="mb-3 px-2 py-1.5 rounded bg-[#ff3366]/10 border border-[#ff3366]/30 text-xs text-[#ff3366] font-bold flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#ff3366] animate-ping inline-block" />
          {liveData.fault_type ?? "FAULT ACTIVE"}
        </div>
      )}

      {/* Header: type icon + ID + gauge */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl leading-none">{typeConfig.icon}</span>
          <div>
            <h3 className="text-sm font-bold leading-tight" style={{ color: accent }}>
              {vid}
            </h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] text-[#475569]">{typeConfig.label}</span>
              <span className="text-[#2d2d3e]">·</span>
              <StatusIndicator status={displayStatus} size="sm" />
            </div>
          </div>
        </div>
        <VehicleHealthGauge
          activeFaults={fault ? 1 : 0}
          recentAnomalies={unresolvedCount}
          size={68}
          showLabel={false}
          accentColor={accent}
        />
      </div>

      {/* Sensor rows */}
      <div className="space-y-0.5">
        {BASE_SENSORS.map(({ key, label, unit, warn, fmt }) => (
          <SensorRow key={key} label={label} value={sensors[key]} unit={unit} warn={warn} fmt={fmt} accent={accent} />
        ))}

        {/* Extra type-specific sensor */}
        {extraConf && (
          <div
            className="flex items-center justify-between rounded px-2 py-0.5 text-xs mt-0.5"
            style={{ backgroundColor: accent + "12", border: `1px solid ${accent}25` }}
          >
            <span className="font-medium" style={{ color: accent + "cc" }}>{extraConf.label}</span>
            <span className="font-mono font-semibold tabular-nums" style={{ color: accent }}>
              {typeof extraVal === "number"
                ? extraConf.fmt(extraVal) + (extraConf.unit ? " " + extraConf.unit : "")
                : "—"}
            </span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
        <Badge severity={displayStatus}>{displayStatus}</Badge>
        {lastAnomaly?.created_at && (
          <span className="text-[10px] text-[#334155]">
            {formatDistanceToNow(new Date(lastAnomaly.created_at), { addSuffix: true })}
          </span>
        )}
      </div>
    </div>
  );
}
