import { useQuery } from "@tanstack/react-query";
import { useWebSocket } from "../hooks/useWebSocket";
import { useVehicles } from "../hooks/useVehicles";
import { useAnomalies } from "../hooks/useAnomalies";
import { getAnalyticsSummary } from "../services/api";
import StatsBar from "../components/dashboard/StatsBar";
import VehicleCard from "../components/dashboard/VehicleCard";
import AnomalyFeed from "../components/dashboard/AnomalyFeed";
import Card, { CardHeader } from "../components/ui/Card";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import StatusIndicator from "../components/ui/StatusIndicator";

export default function Overview() {
  const { connectionStatus } = useWebSocket();

  const { data: vehicles, isLoading: loadingV } = useVehicles();
  const { data: anomalies }  = useAnomalies({ limit: 50 });
  const { data: summary }    = useQuery({
    queryKey:        ["summary"],
    queryFn:          getAnalyticsSummary,
    refetchInterval:  5000,
  });

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <StatsBar summary={summary} vehicles={vehicles ?? []} />

      {/* Main 2-column layout */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4">

        {/* Left: vehicle cards */}
        <section className="space-y-3 min-w-0">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-[#475569] uppercase tracking-widest">
              Fleet — 3 vehicles
            </h2>
            <StatusIndicator status={connectionStatus} label={connectionStatus} size="sm" />
          </div>

          {loadingV ? (
            <div className="flex justify-center py-12"><LoadingSpinner size="lg" /></div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-3 gap-3">
              {(vehicles ?? []).map((v) => (
                <VehicleCard key={v.vehicle_id} vehicle={v} liveData={v.live} />
              ))}
            </div>
          )}
        </section>

        {/* Right: live anomaly feed */}
        <aside className="min-w-0">
          <Card className="sticky top-16 h-fit">
            <CardHeader
              title="Live Anomaly Feed"
              subtitle={`${anomalies?.filter((a) => !a.resolved).length ?? 0} unresolved`}
              action={
                <span className="text-[10px] text-[#334155]">
                  {anomalies?.length ?? 0} total
                </span>
              }
            />
            <AnomalyFeed anomalies={anomalies ?? []} />
          </Card>
        </aside>
      </div>
    </div>
  );
}
