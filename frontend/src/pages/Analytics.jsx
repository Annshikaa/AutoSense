import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subHours, isAfter } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line,
  PieChart, Pie, Legend, Sector,
} from "recharts";
import { useAnomalies } from "../hooks/useAnomalies";
import { getAnalyticsSummary, getHeatmap } from "../services/api";
import Card, { CardHeader } from "../components/ui/Card";
import AnomalyHeatmap from "../components/charts/AnomalyHeatmap";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import Badge from "../components/ui/Badge";

const CHART_TOOLTIP_STYLE = {
  contentStyle: { background: "#0a0a0f", border: "1px solid #1e1e2e", borderRadius: 8, fontSize: 11 },
  cursor: { fill: "#1e1e2e" },
};

const VEHICLE_COLORS = {
  car_01: "#3b82f6", car_02: "#60a5fa", car_03: "#93c5fd",
  truck_01: "#ffaa00", truck_02: "#fbbf24", truck_03: "#fcd34d",
  bus_01: "#00ff88", bus_02: "#34d399", bus_03: "#6ee7b7",
  ambulance_01: "#ff3366",
};
const SEV_COLORS     = { warning: "#ffaa00", critical: "#ff3366", fatal: "#ff1744" };
const FAULT_COLORS   = ["#3b82f6","#00ff88","#ffaa00","#a855f7","#06b6d4","#f43f5e"];

// ── Per-vehicle bar chart ─────────────────────────────────────────────────────
function VehicleBar({ anomalies }) {
  const data = useMemo(() => {
    const counts = {};
    anomalies.forEach((a) => { counts[a.vehicle_id] = (counts[a.vehicle_id] ?? 0) + 1; });
    return Object.entries(counts).map(([v, c]) => ({ vehicle: v, count: c, id: v }));
  }, [anomalies]);

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" vertical={false} />
        <XAxis dataKey="vehicle" tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} />
        <YAxis tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} />
        <Tooltip {...CHART_TOOLTIP_STYLE} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Anomalies">
          {data.map((d) => <Cell key={d.id} fill={VEHICLE_COLORS[d.id] ?? "#3b82f6"} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Anomalies over time (last 24 h, by hour) ──────────────────────────────────
function TimelineChart({ anomalies }) {
  const data = useMemo(() => {
    const now    = new Date();
    const hours  = Array.from({ length: 24 }, (_, i) => {
      const h = subHours(now, 23 - i);
      return { hour: format(h, "HH:00"), cutoff: h, count: 0 };
    });
    anomalies.forEach((a) => {
      if (!a.created_at) return;
      const t = new Date(a.created_at);
      for (let i = hours.length - 1; i >= 0; i--) {
        if (isAfter(t, hours[i].cutoff)) { hours[i].count++; break; }
      }
    });
    return hours.map(({ hour, count }) => ({ hour, count }));
  }, [anomalies]);

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" vertical={false} />
        <XAxis dataKey="hour" tick={{ fill: "#475569", fontSize: 9 }} tickLine={false} interval={3} />
        <YAxis tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} allowDecimals={false} />
        <Tooltip {...CHART_TOOLTIP_STYLE} />
        <Line
          type="monotone"
          dataKey="count"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: "#3b82f6" }}
          isAnimationActive={false}
          name="Anomalies"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Fault type pie chart ──────────────────────────────────────────────────────
function FaultPie({ anomalies }) {
  const data = useMemo(() => {
    const counts = {};
    anomalies.forEach((a) => {
      const ft = a.anomaly_type ?? "Unknown";
      counts[ft] = (counts[ft] ?? 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name: name.replace("_FAULT", ""), value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [anomalies]);

  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={data}
          cx="50%" cy="50%"
          innerRadius="45%"
          outerRadius="70%"
          paddingAngle={3}
          dataKey="value"
          nameKey="name"
        >
          {data.map((_, i) => <Cell key={i} fill={FAULT_COLORS[i % FAULT_COLORS.length]} />)}
        </Pie>
        <Tooltip
          contentStyle={{ background: "#0a0a0f", border: "1px solid #1e1e2e", borderRadius: 8, fontSize: 11 }}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          formatter={(v) => <span style={{ color: "#64748b", fontSize: 10 }}>{v}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ── Most problematic vehicle callout ─────────────────────────────────────────
function ProblematicCallout({ summary, anomalies }) {
  const vid   = summary?.most_problematic_vehicle;
  const fault = summary?.most_common_fault_type;
  if (!vid) return null;

  const count = anomalies.filter((a) => a.vehicle_id === vid && !a.resolved).length;

  return (
    <div className="flex items-center gap-4 rounded-xl border border-[#ff3366]/30 bg-[#ff3366]/5 px-4 py-3">
      <div className="text-2xl">⚠️</div>
      <div>
        <p className="text-xs text-[#ff3366] font-bold uppercase tracking-widest mb-0.5">
          Most Problematic Vehicle
        </p>
        <p className="text-lg font-bold text-[#e2e8f0]">{vid}</p>
        <p className="text-xs text-[#64748b]">
          {count} unresolved · most common: <span className="text-[#ffaa00]">{fault?.replace("_FAULT","")}</span>
        </p>
      </div>
      <div className="ml-auto">
        <Badge severity="fatal">{count} open</Badge>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Analytics() {
  const { data: summary,  isLoading: loadingS } = useQuery({ queryKey: ["summary"], queryFn: getAnalyticsSummary, refetchInterval: 10000 });
  const { data: heatmap,  isLoading: loadingH } = useQuery({ queryKey: ["heatmap"],  queryFn: getHeatmap,           refetchInterval: 15000 });
  const { data: anomalies = [] } = useAnomalies({ limit: 500 });

  return (
    <div className="space-y-4">
      <h1 className="text-base font-bold text-[#e2e8f0]">Analytics</h1>

      {/* Most problematic callout */}
      {summary && <ProblematicCallout summary={summary} anomalies={anomalies} />}

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Anomalies",  value: summary?.total_anomalies,    color: "#ff3366" },
          { label: "Active Anomalies", value: summary?.active_anomalies,   color: "#ffaa00" },
          { label: "Faults Today",     value: summary?.anomalies_last_24h, color: "#3b82f6" },
          { label: "Fleet Vehicles",   value: summary?.total_vehicles,     color: "#00ff88" },
        ].map(({ label, value, color }) => (
          <Card key={label} className="text-center py-3">
            <p className="text-2xl font-bold tabular-nums" style={{ color }}>
              {value ?? (loadingS ? <LoadingSpinner size="sm" className="mx-auto" /> : "—")}
            </p>
            <p className="text-[10px] text-[#475569] mt-1 uppercase tracking-wider">{label}</p>
          </Card>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader title="Anomalies by Vehicle" subtitle="All time" />
          <VehicleBar anomalies={anomalies} />
        </Card>

        <Card>
          <CardHeader title="Anomalies Over Time" subtitle="Last 24 hours by hour" />
          <TimelineChart anomalies={anomalies} />
        </Card>

        <Card>
          <CardHeader title="Fault Type Distribution" subtitle="All detections" />
          <FaultPie anomalies={anomalies} />
        </Card>
      </div>

      {/* Severity breakdown */}
      {summary?.severity_breakdown && (
        <Card>
          <CardHeader title="Severity Breakdown" />
          <div className="flex gap-6 flex-wrap">
            {Object.entries(summary.severity_breakdown).map(([sev, count]) => (
              <div key={sev} className="flex items-center gap-3">
                <Badge severity={sev}>{sev}</Badge>
                <span className="text-2xl font-bold tabular-nums" style={{ color: SEV_COLORS[sev] ?? "#94a3b8" }}>
                  {count}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Full heatmap */}
      <Card>
        <CardHeader
          title="Fault Frequency Heatmap"
          subtitle="Sensor fault occurrences per vehicle — hover cells for exact counts"
        />
        {loadingH
          ? <div className="flex justify-center py-8"><LoadingSpinner /></div>
          : <AnomalyHeatmap data={heatmap} />}
      </Card>
    </div>
  );
}
