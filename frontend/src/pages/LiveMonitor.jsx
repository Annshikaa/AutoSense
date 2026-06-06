import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Activity, FileDown } from "lucide-react";
import { useWebSocket } from "../hooks/useWebSocket";
import { useAnomalies } from "../hooks/useAnomalies";
import { getSensorHistory, printVehicleReport } from "../services/api";
import Card, { CardHeader } from "../components/ui/Card";
import SensorLineChart from "../components/charts/SensorLineChart";
import VehicleHealthGauge from "../components/charts/VehicleHealthGauge";
import AnomalyFeed from "../components/dashboard/AnomalyFeed";
import Badge from "../components/ui/Badge";
import StatusIndicator from "../components/ui/StatusIndicator";
import LoadingSpinner from "../components/ui/LoadingSpinner";

const VEHICLES = [
  "car_01", "car_02", "car_03",
  "truck_01", "truck_02", "truck_03",
  "bus_01", "bus_02", "bus_03",
  "ambulance_01",
];

const SENSOR_COLORS = {
  rpm:         "#3b82f6",
  speed:       "#00ff88",
  temperature: "#ffaa00",
  throttle:    "#a855f7",
  battery:     "#06b6d4",
};

const MAX_HISTORY = 120;

export default function LiveMonitor() {
  const { vehicleId = "car_01" } = useParams();
  const navigate = useNavigate();

  const { latestReadings } = useWebSocket();
  const live = latestReadings[vehicleId] ?? null;

  const [history, setHistory] = useState([]);

  // Seed from DB
  const { data: dbHistory, isLoading } = useQuery({
    queryKey: ["sensor-history", vehicleId],
    queryFn:  () => getSensorHistory(vehicleId, MAX_HISTORY),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (dbHistory) {
      setHistory(
        [...dbHistory].reverse().map((r) => ({
          sensors:      { rpm: r.rpm, speed: r.speed, temperature: r.temperature, throttle: r.throttle, battery: r.battery },
          fault_active: r.fault_active,
          fault_type:   r.fault_type,
          ts:           r.created_at,
        }))
      );
    }
  }, [dbHistory]);

  // Append live readings
  useEffect(() => {
    if (live) setHistory((p) => [...p, { ...live }].slice(-MAX_HISTORY));
  }, [live]);

  const { data: vehicleAnomalies } = useAnomalies({ vehicle_id: vehicleId, limit: 20 });
  const unresolvedCount = (vehicleAnomalies ?? []).filter((a) => !a.resolved).length;
  const fault           = live?.fault_active ?? false;
  const status          = fault ? "critical" : "normal";

  return (
    <div className="space-y-4">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => navigate("/")}
          className="p-1 rounded text-[#475569] hover:text-[#94a3b8] hover:bg-[#1e1e2e] transition-colors"
        >
          <ChevronLeft size={18} />
        </button>

        <Activity size={16} className="text-[#3b82f6]" />
        <h1 className="text-base font-bold text-[#e2e8f0]">{vehicleId}</h1>

        <StatusIndicator status={status} label={fault ? "fault active" : "nominal"} />

        {fault && (
          <Badge severity="critical" className="animate-pulse">
            {live?.fault_type ?? "FAULT"}
          </Badge>
        )}

        {/* PDF report */}
        <button
          onClick={() => printVehicleReport(vehicleId)}
          title="Download Health Report (PDF)"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-[#a78bfa]/10 text-[#a78bfa] border border-[#a78bfa]/25 hover:bg-[#a78bfa]/20 transition-colors"
        >
          <FileDown size={12} /> Health Report
        </button>

        {/* Vehicle switcher */}
        <div className="ml-auto flex gap-1 bg-[#0f0f17] rounded-lg p-0.5">
          {VEHICLES.map((v) => (
            <button
              key={v}
              onClick={() => navigate(`/monitor/${v}`)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                v === vehicleId
                  ? "bg-[#3b82f6]/20 text-[#3b82f6]"
                  : "text-[#475569] hover:text-[#94a3b8]"
              }`}
            >
              {v.replace("vehicle_", "V")}
            </button>
          ))}
        </div>
      </div>

      {/* ── Top section: large gauge + current readings ───────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-4">

        {/* Large health gauge */}
        <Card className="flex flex-col items-center justify-center p-6 min-w-[180px]">
          <VehicleHealthGauge
            activeFaults={fault ? 1 : 0}
            recentAnomalies={unresolvedCount}
            size={160}
            showLabel
          />
          <p className="mt-2 text-xs text-[#475569] text-center">{vehicleId}</p>
        </Card>

        {/* Live sensor readings */}
        <Card>
          <CardHeader title="Current Sensor Values" subtitle="Latest live packet" />
          {live?.sensors ? (
            <div className="grid grid-cols-5 gap-2">
              {Object.entries(SENSOR_COLORS).map(([key, color]) => {
                const val = live.sensors[key];
                return (
                  <div
                    key={key}
                    className="rounded-lg p-3 text-center"
                    style={{ background: `${color}0e`, border: `1px solid ${color}22` }}
                  >
                    <p className="text-[10px] text-[#475569] uppercase tracking-widest mb-1">{key}</p>
                    <p
                      className="text-xl font-bold font-mono tabular-nums leading-none"
                      style={{ color }}
                    >
                      {typeof val === "number" ? val.toFixed(1) : "—"}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center py-8 gap-2 text-[#334155] text-sm">
              {isLoading ? <><LoadingSpinner size="sm" /> Loading…</> : "Waiting for live data…"}
            </div>
          )}
        </Card>
      </div>

      {/* ── 5 sensor charts in 2-column grid ─────────────────────────────── */}
      <div>
        <h2 className="text-xs font-semibold text-[#475569] uppercase tracking-widest mb-3">
          Sensor Time Series
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {Object.entries(SENSOR_COLORS).map(([sensor, color]) => (
            <Card key={sensor}>
              <SensorLineChart
                vehicleId={vehicleId}
                sensorName={sensor}
                color={color}
                initialData={history.map((h) => ({
                  ...h.sensors,
                  fault_active: h.fault_active,
                  created_at: h.ts,
                }))}
              />
            </Card>
          ))}
        </div>
      </div>

      {/* ── Anomaly event log ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader
          title="Anomaly Events"
          subtitle={`${vehicleId} — last 20 detections`}
          action={
            <Link
              to="/anomalies"
              className="text-[10px] text-[#3b82f6] hover:text-[#60a5fa] transition-colors"
            >
              View all →
            </Link>
          }
        />
        <AnomalyFeed anomalies={vehicleAnomalies ?? []} />
      </Card>
    </div>
  );
}
