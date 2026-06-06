import { useEffect, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, CheckCircle2, Eye } from "lucide-react";
import Badge from "../ui/Badge";
import Modal, { ModalField, ModalInput, ModalTextarea } from "../ui/Modal";
import { useResolveAnomalyFull, useAcknowledgeAnomaly } from "../../hooks/useAnomalies";
import clsx from "clsx";

const VEHICLE_ICON = { car: "🚗", truck: "🚛", bus: "🚌", ambulance: "🚑" };

// ── Resolve modal ─────────────────────────────────────────────────────────────
function ResolveModal({ open, onClose, anomaly }) {
  const { mutate: resolve, isPending } = useResolveAnomalyFull();
  const [form, setForm] = useState({ resolved_by: "", resolution_notes: "", create_maintenance_log: false });

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  function submit(e) {
    e.preventDefault();
    if (!form.resolved_by.trim()) return;
    resolve(
      { id: anomaly.id, ...form },
      { onSuccess: () => { onClose(); setForm({ resolved_by: "", resolution_notes: "", create_maintenance_log: false }); } },
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Resolve Anomaly">
      {/* Anomaly summary */}
      <div
        className="rounded-lg p-3 mb-4 text-xs space-y-1"
        style={{ backgroundColor: "var(--bg-2)", border: "1px solid var(--bd)" }}
      >
        <div className="flex items-center gap-2">
          <span style={{ color: "var(--t2)" }}>{anomaly?.vehicle_id}</span>
          <Badge severity={anomaly?.severity}>{anomaly?.severity}</Badge>
        </div>
        <p style={{ color: "var(--t3)" }}>{anomaly?.anomaly_type}</p>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <ModalField label="Resolved by *">
          <ModalInput
            value={form.resolved_by}
            onChange={(e) => set("resolved_by", e.target.value)}
            placeholder="Your name"
            required
          />
        </ModalField>

        <ModalField label="Resolution notes">
          <ModalTextarea
            value={form.resolution_notes}
            onChange={(e) => set("resolution_notes", e.target.value)}
            placeholder="What was done to resolve this fault? (optional)"
          />
        </ModalField>

        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={form.create_maintenance_log}
            onChange={(e) => set("create_maintenance_log", e.target.checked)}
            className="w-3.5 h-3.5 accent-[#3b82f6] cursor-pointer"
          />
          <span className="text-xs" style={{ color: "var(--t3)" }}>
            Auto-create maintenance log (fault_resolved)
          </span>
        </label>

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
            className="px-4 py-1.5 rounded-lg text-xs font-medium bg-[#00ff88]/15 text-[#00ff88] border border-[#00ff88]/30 hover:bg-[#00ff88]/25 transition-colors disabled:opacity-40"
          >
            {isPending ? "Resolving…" : "Resolve"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Acknowledge modal ─────────────────────────────────────────────────────────
function AckModal({ open, onClose, anomalyId }) {
  const { mutate: ack, isPending } = useAcknowledgeAnomaly();
  const [name, setName] = useState("");

  function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    ack(
      { id: anomalyId, acknowledged_by: name.trim() },
      { onSuccess: () => { onClose(); setName(""); } },
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Acknowledge Anomaly" size="sm">
      <form onSubmit={submit} className="space-y-3">
        <p className="text-xs" style={{ color: "var(--t3)" }}>
          Mark this anomaly as seen. It will remain active until resolved.
        </p>
        <ModalField label="Your name *">
          <ModalInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name"
            autoFocus
            required
          />
        </ModalField>
        <div className="flex gap-2 justify-end">
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
            className="px-4 py-1.5 rounded-lg text-xs font-medium bg-[#ffaa00]/15 text-[#ffaa00] border border-[#ffaa00]/30 hover:bg-[#ffaa00]/25 transition-colors disabled:opacity-40"
          >
            {isPending ? "…" : "Acknowledge"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Feed item ─────────────────────────────────────────────────────────────────
const SLIDE_DURATION = 350;

function FeedItem({ anomaly, isNew }) {
  const [visible,     setVisible]     = useState(false);
  const [showResolve, setShowResolve] = useState(false);
  const [showAck,     setShowAck]     = useState(false);

  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const sev      = anomaly.severity ?? "warning";
  const resolved = anomaly.resolved;

  // Detect vehicle type from id prefix for icon
  const vtype = ["car","truck","bus","ambulance"].find((t) => anomaly.vehicle_id?.startsWith(t)) ?? "car";

  const borderColor =
    sev === "fatal"    ? "border-[#ff3366]/60" :
    sev === "critical" ? "border-[#ff3366]/35" :
                         "border-[#ffaa00]/25";
  const bgColor =
    sev === "fatal"    ? "bg-[#ff3366]/8" :
    sev === "critical" ? "bg-[#ff3366]/5" :
                         "bg-[#ffaa00]/4";

  return (
    <>
      <div
        className={clsx(
          "flex flex-col gap-1.5 px-3 py-2.5 rounded-lg border text-xs transition-all ease-out",
          visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2",
          resolved ? "opacity-25 saturate-0 border-[#1e1e2e]" : clsx(borderColor, bgColor),
          !resolved && sev === "fatal" && "animate-pulse",
        )}
        style={{ transitionDuration: `${SLIDE_DURATION}ms` }}
      >
        {/* Row 1: icon + vehicle + severity + fault type */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-base leading-none">{VEHICLE_ICON[vtype] ?? "🚗"}</span>
          <span className="font-bold text-[#e2e8f0]">{anomaly.vehicle_id}</span>
          <Badge severity={sev} />
          <span className="text-[#64748b] truncate flex-1 min-w-0">{anomaly.anomaly_type}</span>
          {!resolved && sev === "fatal" && (
            <span className="w-1.5 h-1.5 rounded-full bg-[#ff3366] animate-ping shrink-0" />
          )}
        </div>

        {/* Row 2: scores + time */}
        <div className="flex gap-4 text-[#334155] text-[10px]">
          <span>IF <span className="font-mono text-[#475569]">{anomaly.if_score?.toFixed(3)}</span></span>
          <span>LSTM <span className="font-mono text-[#475569]">{anomaly.lstm_error?.toFixed(1)}</span></span>
          <span className="ml-auto">
            {anomaly.created_at
              ? formatDistanceToNow(new Date(anomaly.created_at), { addSuffix: true })
              : "just now"}
          </span>
        </div>

        {/* Row 3: acknowledged state */}
        {anomaly.acknowledged && (
          <div className="flex items-center gap-1 text-[10px] text-[#ffaa00]">
            <Eye size={10} />
            <span>Acked by <strong>{anomaly.acknowledged_by}</strong></span>
          </div>
        )}

        {/* Row 4: action buttons */}
        {!resolved && (
          <div className="flex items-center gap-1.5 mt-0.5">
            {!anomaly.acknowledged && (
              <button
                onClick={() => setShowAck(true)}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-[#ffaa00]/10 text-[#ffaa00] hover:bg-[#ffaa00]/20 transition-colors border border-[#ffaa00]/20"
              >
                <Eye size={10} /> Acknowledge
              </button>
            )}
            <button
              onClick={() => setShowResolve(true)}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-[#00ff88]/10 text-[#00ff88] hover:bg-[#00ff88]/20 transition-colors border border-[#00ff88]/20"
            >
              <CheckCircle2 size={10} /> Resolve
            </button>
          </div>
        )}
      </div>

      <ResolveModal open={showResolve} onClose={() => setShowResolve(false)} anomaly={anomaly} />
      <AckModal     open={showAck}     onClose={() => setShowAck(false)}     anomalyId={anomaly.id} />
    </>
  );
}

// ── Feed container ────────────────────────────────────────────────────────────
export default function AnomalyFeed({ anomalies = [] }) {
  const prevIds = useRef(new Set());
  const [newIds, setNewIds] = useState(new Set());

  useEffect(() => {
    const incoming = anomalies
      .map((a) => a.id)
      .filter((id) => id && !prevIds.current.has(id));

    if (incoming.length) {
      setNewIds(new Set(incoming));
      incoming.forEach((id) => prevIds.current.add(id));
      setTimeout(() => setNewIds(new Set()), SLIDE_DURATION + 100);
    }
    if (prevIds.current.size === 0 && anomalies.length) {
      anomalies.forEach((a) => a.id && prevIds.current.add(a.id));
    }
  }, [anomalies]);

  return (
    <div className="flex flex-col gap-1.5 max-h-[420px] overflow-y-auto pr-1 custom-scroll">
      {anomalies.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 gap-2 text-[#334155]">
          <AlertTriangle size={24} />
          <span className="text-xs">No anomalies recorded yet</span>
        </div>
      )}
      {anomalies.map((a) => (
        <FeedItem key={a.id} anomaly={a} isNew={newIds.has(a.id)} />
      ))}
    </div>
  );
}
