import { useState, useMemo } from "react";
import { formatDistanceToNow, format, isAfter, parseISO } from "date-fns";
import { Download, CheckCircle2, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { useAnomalies, useResolveAnomaly } from "../hooks/useAnomalies";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import clsx from "clsx";

const PAGE_SIZE  = 20;
const SEVERITIES = ["", "fatal", "critical", "warning"];
const VEHICLES = [
  "", "car_01", "car_02", "car_03",
  "truck_01", "truck_02", "truck_03",
  "bus_01", "bus_02", "bus_03",
  "ambulance_01",
];

// ── CSV export ────────────────────────────────────────────────────────────────
function exportCSV(rows) {
  const HEADERS = ["time", "vehicle", "fault_type", "severity", "if_score", "lstm_error", "resolved"];
  const lines = [
    HEADERS.join(","),
    ...rows.map((a) =>
      [
        a.created_at ? format(new Date(a.created_at), "yyyy-MM-dd HH:mm:ss") : "",
        a.vehicle_id,
        a.anomaly_type,
        a.severity,
        a.if_score?.toFixed(4),
        a.lstm_error?.toFixed(2),
        a.resolved,
      ].join(",")
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `anomalies_${format(new Date(), "yyyyMMdd_HHmm")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Filter bar ────────────────────────────────────────────────────────────────
function FilterSelect({ value, onChange, options, placeholder }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-[#0f0f17] border border-[#1e1e2e] text-[#94a3b8] text-xs rounded-lg px-2.5 py-1.5 outline-none focus:border-[#3b82f6]/50 transition-colors cursor-pointer"
    >
      <option value="">{placeholder}</option>
      {options.filter(Boolean).map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}

// ── Pagination ────────────────────────────────────────────────────────────────
function Pager({ page, totalPages, onPage }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center gap-2 justify-end mt-3">
      <button
        onClick={() => onPage(page - 1)}
        disabled={page === 1}
        className="p-1 rounded text-[#475569] hover:text-[#94a3b8] disabled:opacity-30 transition-colors"
      >
        <ChevronLeft size={16} />
      </button>
      <span className="text-xs text-[#475569]">
        {page} / {totalPages}
      </span>
      <button
        onClick={() => onPage(page + 1)}
        disabled={page === totalPages}
        className="p-1 rounded text-[#475569] hover:text-[#94a3b8] disabled:opacity-30 transition-colors"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AnomalyHistory() {
  const [severity,   setSeverity]   = useState("");
  const [vehicleId,  setVehicleId]  = useState("");
  const [resolved,   setResolved]   = useState("");
  const [dateFrom,   setDateFrom]   = useState("");
  const [page,       setPage]       = useState(1);

  const { data: anomalies = [], isLoading } = useAnomalies({ limit: 500 });
  const { mutate: resolve, isPending }      = useResolveAnomaly();

  // Client-side filtering
  const filtered = useMemo(() => {
    let list = anomalies;
    if (severity)  list = list.filter((a) => a.severity  === severity);
    if (vehicleId) list = list.filter((a) => a.vehicle_id === vehicleId);
    if (resolved === "true")  list = list.filter((a) =>  a.resolved);
    if (resolved === "false") list = list.filter((a) => !a.resolved);
    if (dateFrom) {
      const cutoff = parseISO(dateFrom);
      list = list.filter((a) => a.created_at && isAfter(new Date(a.created_at), cutoff));
    }
    return list;
  }, [anomalies, severity, vehicleId, resolved, dateFrom]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const pageSlice  = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const resetPage = () => setPage(1);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-base font-bold text-[#e2e8f0]">Anomaly History</h1>
        <button
          onClick={() => exportCSV(filtered)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1e1e2e] text-[#94a3b8] hover:text-[#e2e8f0] hover:bg-[#2d2d3e] text-xs transition-colors"
        >
          <Download size={13} /> Export CSV
        </button>
      </div>

      {/* Filters */}
      <Card className="flex flex-wrap items-center gap-3">
        <FilterSelect value={vehicleId} onChange={(v) => { setVehicleId(v); resetPage(); }}
          options={VEHICLES} placeholder="All vehicles" />
        <FilterSelect value={severity}  onChange={(v) => { setSeverity(v);  resetPage(); }}
          options={SEVERITIES} placeholder="All severities" />
        <FilterSelect value={resolved}  onChange={(v) => { setResolved(v);  resetPage(); }}
          options={["true","false"]} placeholder="All statuses" />

        {/* Date from */}
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-[#475569] uppercase tracking-wider">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); resetPage(); }}
            className="bg-[#0f0f17] border border-[#1e1e2e] text-[#94a3b8] text-xs rounded-lg px-2.5 py-1.5 outline-none focus:border-[#3b82f6]/50 transition-colors"
          />
        </div>

        {/* Clear filters */}
        {(severity || vehicleId || resolved || dateFrom) && (
          <button
            onClick={() => { setSeverity(""); setVehicleId(""); setResolved(""); setDateFrom(""); resetPage(); }}
            className="text-xs text-[#475569] hover:text-[#ff3366] transition-colors"
          >
            Clear filters
          </button>
        )}

        <span className="ml-auto text-xs text-[#334155]">
          {filtered.length} result{filtered.length !== 1 ? "s" : ""}
        </span>
      </Card>

      {/* Table */}
      <Card className="overflow-x-auto">
        {isLoading ? (
          <div className="flex justify-center py-10"><LoadingSpinner size="lg" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-[#334155]">
            <AlertTriangle size={24} />
            <span className="text-sm">No anomalies match the current filters</span>
          </div>
        ) : (
          <>
            <table className="w-full text-xs border-collapse min-w-[700px]">
              <thead>
                <tr className="border-b border-[#1e1e2e]">
                  {["Time", "Vehicle", "Fault Type", "Severity", "IF Score", "LSTM Error", "Status", "Action"].map((h) => (
                    <th key={h} className="text-left text-[#334155] font-normal pb-2.5 pr-4 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageSlice.map((a, i) => (
                  <tr
                    key={a.id}
                    className={clsx(
                      "border-b border-[#0f0f17] hover:bg-[#1e1e2e]/40 transition-colors",
                      i % 2 === 0 ? "" : "bg-[#0d0d14]/40",
                      a.resolved && "opacity-40",
                    )}
                  >
                    <td className="py-2.5 pr-4 text-[#475569] whitespace-nowrap">
                      {a.created_at
                        ? formatDistanceToNow(new Date(a.created_at), { addSuffix: true })
                        : "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-[#e2e8f0] font-semibold whitespace-nowrap">
                      {a.vehicle_id}
                    </td>
                    <td className="py-2.5 pr-4 text-[#94a3b8] whitespace-nowrap">
                      {a.anomaly_type}
                    </td>
                    <td className="py-2.5 pr-4">
                      <Badge severity={a.severity}>{a.severity}</Badge>
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-[#64748b] tabular-nums">
                      {a.if_score?.toFixed(3)}
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-[#64748b] tabular-nums">
                      {a.lstm_error?.toFixed(1)}
                    </td>
                    <td className="py-2.5 pr-4">
                      {a.resolved ? (
                        <span className="flex items-center gap-1 text-[#334155]">
                          <CheckCircle2 size={12} /> resolved
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[#ffaa00]">
                          <AlertTriangle size={12} /> open
                        </span>
                      )}
                    </td>
                    <td className="py-2.5">
                      {!a.resolved && (
                        <button
                          onClick={() => resolve(a.id)}
                          disabled={isPending}
                          className="flex items-center gap-1 text-[#334155] hover:text-[#00ff88] transition-colors disabled:opacity-40 text-[10px]"
                        >
                          <CheckCircle2 size={12} /> Resolve
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <Pager page={safePage} totalPages={totalPages} onPage={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
