import { useEffect, useRef, useState } from "react";
import { Car, AlertTriangle, Zap, HeartPulse } from "lucide-react";
import clsx from "clsx";

// ── Animated counter ──────────────────────────────────────────────────────────
function useCountUp(target, duration = 500) {
  const [value, setValue] = useState(target ?? 0);
  const prev = useRef(target ?? 0);

  useEffect(() => {
    if (target == null) return;
    const start    = prev.current;
    const end      = target;
    if (start === end) return;

    const startTime = performance.now();
    const step = (now) => {
      const t      = Math.min((now - startTime) / duration, 1);
      const eased  = 1 - Math.pow(1 - t, 3);          // ease-out cubic
      setValue(Math.round(start + (end - start) * eased));
      if (t < 1) requestAnimationFrame(step);
      else prev.current = end;
    };
    requestAnimationFrame(step);
  }, [target, duration]);

  return value;
}

// ── Individual stat card ──────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color, flash }) {
  const animated = useCountUp(typeof value === "number" ? value : null);
  const display  = typeof value === "number" ? animated : value ?? "—";

  const [didFlash, setDidFlash] = useState(false);
  const prevVal = useRef(value);
  useEffect(() => {
    if (value !== prevVal.current && typeof value === "number") {
      setDidFlash(true);
      prevVal.current = value;
      setTimeout(() => setDidFlash(false), 600);
    }
  }, [value]);

  return (
    <div
      className={clsx(
        "relative rounded-xl border bg-[#12121a] px-4 py-3 flex items-center gap-3 overflow-hidden",
        "transition-all duration-300",
        didFlash ? "border-[#3b82f6]/50 shadow-[0_0_16px_rgba(59,130,246,0.12)]" : "border-[#1e1e2e]",
      )}
    >
      {/* glow orb behind icon */}
      <div
        className="absolute -left-3 top-1/2 -translate-y-1/2 w-16 h-16 rounded-full opacity-10 blur-xl pointer-events-none"
        style={{ background: color }}
      />

      <div
        className="relative flex items-center justify-center w-9 h-9 rounded-lg shrink-0"
        style={{ background: `${color}18` }}
      >
        <Icon size={18} style={{ color }} />
      </div>

      <div className="min-w-0">
        <p className="text-xs text-[#475569] leading-none mb-1 truncate">{label}</p>
        <p
          className="text-2xl font-bold tabular-nums leading-none"
          style={{ color: didFlash ? color : "#e2e8f0", transition: "color 0.3s" }}
        >
          {display}
        </p>
        {sub && <p className="text-[10px] text-[#334155] mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  );
}

// ── Avg health score from vehicles ────────────────────────────────────────────
function avgHealthColor(score) {
  if (score >= 70) return "#00ff88";
  if (score >= 40) return "#ffaa00";
  return "#ff3366";
}

function calcAvgHealth(vehicles = []) {
  if (!vehicles.length) return null;
  const scores = vehicles.map((v) => {
    const fault = v.live?.fault_active ? 1 : 0;
    return Math.max(0, 100 - fault * 25);
  });
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

// ── StatsBar ──────────────────────────────────────────────────────────────────
export default function StatsBar({ summary, vehicles = [] }) {
  const avgHealth = calcAvgHealth(vehicles);
  const healthColor = avgHealthColor(avgHealth ?? 100);

  const faultsToday = summary?.anomalies_last_24h ?? null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <StatCard
        icon={Car}
        label="Active Vehicles"
        value={summary?.active_vehicles ?? null}
        sub={summary?.total_vehicles != null ? `of ${summary.total_vehicles} total` : undefined}
        color="#00ff88"
      />
      <StatCard
        icon={AlertTriangle}
        label="Active Anomalies"
        value={summary?.active_anomalies ?? null}
        sub={summary?.total_anomalies != null ? `${summary.total_anomalies} total` : undefined}
        color="#ff3366"
      />
      <StatCard
        icon={Zap}
        label="Faults Today"
        value={faultsToday}
        sub={summary?.most_common_fault_type
          ? `most: ${summary.most_common_fault_type.replace("_FAULT", "")}`
          : undefined}
        color="#ffaa00"
      />
      <StatCard
        icon={HeartPulse}
        label="Avg Health Score"
        value={avgHealth}
        sub={summary?.most_problematic_vehicle
          ? `worst: ${summary.most_problematic_vehicle}`
          : undefined}
        color={healthColor}
      />
    </div>
  );
}
