import { useState, useEffect, useRef } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { format } from "date-fns";
import { useWebSocket } from "../../hooks/useWebSocket";

const MAX_POINTS = 50;

const SENSOR_META = {
  rpm:          { label: "RPM",         unit: "rpm",  domain: [0, 8000],  warnLine: 6000 },
  speed:        { label: "Speed",       unit: "km/h", domain: [0, 220],   warnLine: 160  },
  temperature:  { label: "Temperature", unit: "°C",   domain: [60, 145],  warnLine: 105  },
  throttle:     { label: "Throttle",    unit: "%",    domain: [0, 105],   warnLine: 95   },
  battery:      { label: "Battery",     unit: "V",    domain: [10, 30],   warnLine: null },
  fuel_level:   { label: "Fuel Level",  unit: "%",    domain: [0, 100],   warnLine: 15   },
  load_weight:  { label: "Load Weight", unit: "%",    domain: [0, 120],   warnLine: 100  },
  door_status:  { label: "Door Status", unit: "",     domain: [0, 1.2],   warnLine: null },
  siren_active: { label: "Siren",       unit: "",     domain: [0, 1.2],   warnLine: null },
};

const CustomTooltip = ({ active, payload, unit }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-2.5 py-1.5 text-xs shadow-xl">
      <span style={{ color: payload[0]?.color }} className="font-bold tabular-nums">
        {payload[0]?.value?.toFixed(2)} {unit}
      </span>
    </div>
  );
};

export default function SensorLineChart({
  vehicleId,
  sensorName,
  color = "#3b82f6",
  initialData = [],   // [{ rpm, speed, …, fault_active, created_at }, …]
}) {
  const { latestReadings } = useWebSocket();
  const meta = SENSOR_META[sensorName] ?? { label: sensorName, unit: "", domain: ["auto","auto"], warnLine: null };

  const [points, setPoints] = useState([]);

  // ── Seed from DB history (runs once when initialData first arrives) ──────
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current || !initialData.length) return;
    seededRef.current = true;
    setPoints(
      initialData.slice(-MAX_POINTS).map((d) => ({
        t:     d.created_at ? format(new Date(d.created_at), "HH:mm:ss") : "",
        val:   d[sensorName] ?? 0,
        fault: d.fault_active ?? false,
      }))
    );
  }, [initialData, sensorName]);

  // ── Append live WS readings — deduplicate by ts ───────────────────────────
  const lastTsRef = useRef("");
  // Read only this vehicle's entry to avoid running on other vehicles' updates
  const vehicleReading = latestReadings[vehicleId];

  useEffect(() => {
    if (!vehicleReading?.sensors) return;

    const ts = vehicleReading.ts ?? "";
    if (ts && ts === lastTsRef.current) return;   // already processed this packet
    lastTsRef.current = ts;

    const val   = vehicleReading.sensors[sensorName] ?? 0;
    const fault = vehicleReading.fault_active ?? false;
    const label = ts ? format(new Date(ts), "HH:mm:ss") : format(new Date(), "HH:mm:ss");

    setPoints((prev) => [...prev, { t: label, val, fault }].slice(-MAX_POINTS));

    // Flash on rising edge
    if (fault && !faultRef.current) {
      setFlashing(true);
      clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlashing(false), 900);
    }
    faultRef.current = fault;
  // vehicleReading changes only when THIS vehicle gets a new WS packet
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleReading]);

  const [flashing, setFlashing] = useState(false);
  const flashTimer = useRef(null);
  const faultRef   = useRef(false);

  const currentVal = points.at(-1)?.val ?? null;
  const isFault    = points.at(-1)?.fault ?? false;

  return (
    <div
      className="rounded-lg transition-all duration-300"
      style={flashing ? { outline: "1px solid #ff3366", background: "rgba(255,51,102,0.04)" } : {}}
    >
      {/* Current value */}
      <div className="flex items-baseline justify-between mb-1 px-1">
        <span className="text-[10px] text-[#475569] uppercase tracking-widest">{meta.label}</span>
        <span
          className="text-xl font-bold font-mono tabular-nums leading-none"
          style={{ color: isFault ? "#ff3366" : color, transition: "color 0.3s" }}
        >
          {currentVal !== null ? currentVal.toFixed(1) : "—"}
          <span className="text-[10px] font-normal text-[#334155] ml-0.5">{meta.unit}</span>
        </span>
      </div>

      <ResponsiveContainer width="100%" height={110}>
        <LineChart data={points} margin={{ top: 2, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" vertical={false} />
          <XAxis dataKey="t" hide />
          <YAxis
            domain={meta.domain}
            tick={{ fill: "#2d2d3e", fontSize: 9 }}
            tickLine={false}
            width={32}
          />
          <Tooltip content={<CustomTooltip unit={meta.unit} />} />
          {meta.warnLine && (
            <ReferenceLine
              y={meta.warnLine}
              stroke="#ff3366"
              strokeDasharray="4 3"
              strokeOpacity={0.35}
            />
          )}
          <Line
            type="monotone"
            dataKey="val"
            stroke={isFault ? "#ff3366" : color}
            strokeWidth={1.8}
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0, fill: isFault ? "#ff3366" : color }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
