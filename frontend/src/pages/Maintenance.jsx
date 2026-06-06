import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Filter, DollarSign, Wrench, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { getMaintenance, createMaintenance, getVehicles } from "../services/api";
import Modal, { ModalField, ModalInput, ModalSelect, ModalTextarea } from "../components/ui/Modal";
import LoadingSpinner from "../components/ui/LoadingSpinner";

const LOG_TYPES = [
  "routine_service",
  "fault_resolved",
  "inspection",
  "brake_service",
  "tire_change",
  "battery_replacement",
  "oil_change",
  "software_update",
  "other",
];

const TYPE_COLOR = {
  routine_service:    "#3b82f6",
  fault_resolved:     "#00ff88",
  inspection:         "#a78bfa",
  brake_service:      "#f97316",
  tire_change:        "#ffaa00",
  battery_replacement:"#06b6d4",
  oil_change:         "#84cc16",
  software_update:    "#e879f9",
  other:              "#64748b",
};

function logTypeLabel(t) {
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Add maintenance log modal ─────────────────────────────────────────────────
function AddLogModal({ open, onClose, vehicles }) {
  const qc = useQueryClient();
  const { mutate, isPending, error } = useMutation({
    mutationFn: createMaintenance,
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ["maintenance"] }); onClose(); },
  });

  const [form, setForm] = useState({
    vehicle_id:   "",
    log_type:     "routine_service",
    technician:   "",
    description:  "",
    cost:         "",
    anomaly_id:   "",
  });
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  function submit(e) {
    e.preventDefault();
    if (!form.vehicle_id || !form.technician) return;
    mutate({
      vehicle_id:  form.vehicle_id,
      log_type:    form.log_type,
      technician:  form.technician,
      description: form.description || undefined,
      cost:        form.cost ? parseFloat(form.cost) : undefined,
      anomaly_id:  form.anomaly_id || undefined,
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Maintenance Log">
      <form onSubmit={submit} className="space-y-3">
        {error && (
          <div className="rounded-lg px-3 py-2 text-xs" style={{ backgroundColor: "#ff3366/10", color: "#ff3366", border: "1px solid #ff3366/20" }}>
            {error.response?.data?.detail ?? error.message}
          </div>
        )}

        <ModalField label="Vehicle *">
          <ModalSelect value={form.vehicle_id} onChange={(e) => set("vehicle_id", e.target.value)} required>
            <option value="">Select vehicle…</option>
            {vehicles.map((v) => (
              <option key={v.vehicle_id} value={v.vehicle_id}>{v.vehicle_id}</option>
            ))}
          </ModalSelect>
        </ModalField>

        <ModalField label="Log Type *">
          <ModalSelect value={form.log_type} onChange={(e) => set("log_type", e.target.value)}>
            {LOG_TYPES.map((t) => (
              <option key={t} value={t}>{logTypeLabel(t)}</option>
            ))}
          </ModalSelect>
        </ModalField>

        <ModalField label="Technician *">
          <ModalInput
            value={form.technician}
            onChange={(e) => set("technician", e.target.value)}
            placeholder="Name of technician"
            required
          />
        </ModalField>

        <ModalField label="Description">
          <ModalTextarea
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="What was done?"
          />
        </ModalField>

        <ModalField label="Cost (USD)">
          <ModalInput
            type="number"
            min="0"
            step="0.01"
            value={form.cost}
            onChange={(e) => set("cost", e.target.value)}
            placeholder="e.g. 120.00"
          />
        </ModalField>

        <ModalField label="Linked Anomaly ID">
          <ModalInput
            value={form.anomaly_id}
            onChange={(e) => set("anomaly_id", e.target.value)}
            placeholder="UUID of related anomaly (optional)"
          />
        </ModalField>

        <div className="flex gap-2 justify-end pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs transition-colors"
            style={{ backgroundColor: "var(--bg-2)", color: "var(--t3)", border: "1px solid var(--bd)" }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-1.5 rounded-lg text-xs font-medium bg-[#3b82f6]/15 text-[#3b82f6] border border-[#3b82f6]/30 hover:bg-[#3b82f6]/25 transition-colors disabled:opacity-40"
          >
            {isPending ? "Adding…" : "Add Log"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Timeline entry ────────────────────────────────────────────────────────────
function TimelineEntry({ log }) {
  const [expanded, setExpanded] = useState(false);
  const color = TYPE_COLOR[log.log_type] ?? TYPE_COLOR.other;

  return (
    <div className="flex gap-3">
      {/* Dot + line */}
      <div className="flex flex-col items-center shrink-0">
        <div className="w-2.5 h-2.5 rounded-full mt-1 ring-2 ring-offset-2 shrink-0"
          style={{ backgroundColor: color, ringOffsetColor: "var(--bg-1)" }} />
        <div className="w-px flex-1 mt-1" style={{ backgroundColor: "var(--bd)" }} />
      </div>

      {/* Card */}
      <div
        className="flex-1 mb-3 rounded-lg overflow-hidden"
        style={{ backgroundColor: "var(--bg-2)", border: "1px solid var(--bd)" }}
      >
        <div
          className="flex items-center justify-between px-3 py-2 cursor-pointer select-none"
          onClick={() => setExpanded((x) => !x)}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: color + "20", color }}
            >
              {logTypeLabel(log.log_type)}
            </span>
            <span className="text-xs font-mono font-bold" style={{ color: "var(--t1)" }}>{log.vehicle_id}</span>
            {log.cost != null && (
              <span className="text-[10px] flex items-center gap-0.5" style={{ color: "#00ff88" }}>
                <DollarSign size={9} />{Number(log.cost).toFixed(2)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px]" style={{ color: "var(--t5)" }}>
              {log.created_at
                ? formatDistanceToNow(parseISO(log.created_at), { addSuffix: true })
                : "—"}
            </span>
            {expanded ? <ChevronUp size={12} style={{ color: "var(--t4)" }} /> : <ChevronDown size={12} style={{ color: "var(--t4)" }} />}
          </div>
        </div>

        {expanded && (
          <div className="px-3 pb-3 space-y-1.5 text-xs" style={{ borderTop: "1px solid var(--bd)" }}>
            <div className="pt-2 grid grid-cols-2 gap-x-4 gap-y-1">
              <span style={{ color: "var(--t4)" }}>Technician</span>
              <span style={{ color: "var(--t2)" }}>{log.technician ?? "—"}</span>
              <span style={{ color: "var(--t4)" }}>Date</span>
              <span style={{ color: "var(--t2)" }}>
                {log.created_at ? format(parseISO(log.created_at), "MMM d, yyyy HH:mm") : "—"}
              </span>
              {log.cost != null && (
                <>
                  <span style={{ color: "var(--t4)" }}>Cost</span>
                  <span style={{ color: "#00ff88" }}>${Number(log.cost).toFixed(2)}</span>
                </>
              )}
              {log.anomaly_id && (
                <>
                  <span style={{ color: "var(--t4)" }}>Anomaly</span>
                  <span className="font-mono text-[10px]" style={{ color: "var(--t3)" }}>
                    {log.anomaly_id.substring(0, 8)}…
                  </span>
                </>
              )}
            </div>
            {log.description && (
              <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: "var(--t3)" }}>{log.description}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Cost summary bar ──────────────────────────────────────────────────────────
function CostSummary({ logs }) {
  const byCost = useMemo(() => {
    const map = {};
    for (const l of logs) {
      if (l.cost == null) continue;
      map[l.vehicle_id] = (map[l.vehicle_id] ?? 0) + Number(l.cost);
    }
    return Object.entries(map)
      .map(([id, total]) => ({ id, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  }, [logs]);

  const grandTotal = byCost.reduce((s, x) => s + x.total, 0);
  if (!byCost.length) return null;

  return (
    <div
      className="rounded-xl p-4 space-y-3"
      style={{ backgroundColor: "var(--bg-1)", border: "1px solid var(--bd)" }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold" style={{ color: "var(--t1)" }}>Cost by Vehicle</span>
        <span className="text-xs font-bold text-[#00ff88]">${grandTotal.toFixed(2)} total</span>
      </div>
      <div className="space-y-2">
        {byCost.map(({ id, total }) => (
          <div key={id} className="space-y-0.5">
            <div className="flex justify-between text-[10px]">
              <span className="font-mono" style={{ color: "var(--t2)" }}>{id}</span>
              <span style={{ color: "var(--t3)" }}>${total.toFixed(2)}</span>
            </div>
            <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: "var(--bg-2)" }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${(total / grandTotal) * 100}%`, backgroundColor: "#3b82f6" }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Maintenance() {
  const [showAdd,    setShowAdd]    = useState(false);
  const [filterVid,  setFilterVid]  = useState("");
  const [filterType, setFilterType] = useState("");

  const { data: logs     = [], isLoading } = useQuery({
    queryKey:       ["maintenance"],
    queryFn:         () => getMaintenance(),
    refetchInterval: 30000,
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ["vehicles"],
    queryFn:   () => getVehicles(),
  });

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (filterVid  && l.vehicle_id !== filterVid)  return false;
      if (filterType && l.log_type   !== filterType)  return false;
      return true;
    });
  }, [logs, filterVid, filterType]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-base font-bold" style={{ color: "var(--t1)" }}>Maintenance Log</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--t4)" }}>
            {filtered.length} record{filtered.length !== 1 ? "s" : ""}
            {(filterVid || filterType) ? " (filtered)" : ""}
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#3b82f6]/15 text-[#3b82f6] border border-[#3b82f6]/30 hover:bg-[#3b82f6]/25 transition-colors"
        >
          <Plus size={13} /> Add Log
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_260px] gap-5">
        {/* Left: filters + timeline */}
        <div className="space-y-4">
          {/* Filters */}
          <div
            className="flex flex-wrap items-center gap-3 p-3 rounded-xl"
            style={{ backgroundColor: "var(--bg-1)", border: "1px solid var(--bd)" }}
          >
            <Filter size={13} style={{ color: "var(--t4)" }} />
            <select
              className="as-input text-xs py-1 px-2 flex-1 min-w-[140px]"
              value={filterVid}
              onChange={(e) => setFilterVid(e.target.value)}
            >
              <option value="">All vehicles</option>
              {vehicles.map((v) => (
                <option key={v.vehicle_id} value={v.vehicle_id}>{v.vehicle_id}</option>
              ))}
            </select>
            <select
              className="as-input text-xs py-1 px-2 flex-1 min-w-[160px]"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="">All log types</option>
              {LOG_TYPES.map((t) => (
                <option key={t} value={t}>{logTypeLabel(t)}</option>
              ))}
            </select>
            {(filterVid || filterType) && (
              <button
                onClick={() => { setFilterVid(""); setFilterType(""); }}
                className="text-[10px] px-2 py-1 rounded transition-colors"
                style={{ color: "#ff3366", backgroundColor: "#ff3366/10" }}
              >
                Clear
              </button>
            )}
          </div>

          {/* Timeline */}
          {isLoading ? (
            <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
          ) : filtered.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center py-16 gap-2 rounded-xl"
              style={{ backgroundColor: "var(--bg-1)", border: "1px solid var(--bd)", color: "var(--t5)" }}
            >
              <Wrench size={24} />
              <span className="text-sm">No maintenance records</span>
            </div>
          ) : (
            <div className="pt-2">
              {filtered.map((log) => (
                <TimelineEntry key={log.id} log={log} />
              ))}
            </div>
          )}
        </div>

        {/* Right: cost summary */}
        <div className="space-y-4">
          <CostSummary logs={logs} />

          {/* Log type legend */}
          <div
            className="rounded-xl p-4 space-y-2"
            style={{ backgroundColor: "var(--bg-1)", border: "1px solid var(--bd)" }}
          >
            <span className="text-xs font-semibold" style={{ color: "var(--t1)" }}>Log Types</span>
            <div className="space-y-1.5 mt-2">
              {LOG_TYPES.map((t) => (
                <div key={t} className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: TYPE_COLOR[t] }}
                  />
                  <span className="text-[11px]" style={{ color: "var(--t3)" }}>{logTypeLabel(t)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <AddLogModal open={showAdd} onClose={() => setShowAdd(false)} vehicles={vehicles} />
    </div>
  );
}
