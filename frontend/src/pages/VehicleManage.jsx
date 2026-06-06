import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Pencil, Check, X, AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { getVehicles, registerVehicle, updateVehicle, deleteVehicle } from "../services/api";
import Modal, { ModalField, ModalInput, ModalSelect } from "../components/ui/Modal";
import Badge from "../components/ui/Badge";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import clsx from "clsx";

const TYPE_ICON = { car: "🚗", truck: "🚛", bus: "🚌", ambulance: "🚑" };
const VEHICLE_TYPES = ["car", "truck", "bus", "ambulance"];

// ── Add vehicle modal ─────────────────────────────────────────────────────────
function AddVehicleModal({ open, onClose }) {
  const qc = useQueryClient();
  const { mutate, isPending, error } = useMutation({
    mutationFn: registerVehicle,
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ["vehicles"] }); onClose(); },
  });

  const [form, setForm] = useState({
    vehicle_id:   "",
    vehicle_type: "car",
    display_name: "",
    owner:        "",
  });
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  function submit(e) {
    e.preventDefault();
    mutate({ ...form, display_name: form.display_name || undefined, owner: form.owner || undefined });
  }

  return (
    <Modal open={open} onClose={onClose} title="Register New Vehicle">
      <form onSubmit={submit} className="space-y-3">
        {error && (
          <div className="rounded-lg px-3 py-2 text-xs bg-[#ff3366]/10 text-[#ff3366] border border-[#ff3366]/20">
            {error.response?.data?.detail ?? error.message}
          </div>
        )}

        <ModalField label="Vehicle ID *">
          <ModalInput
            value={form.vehicle_id}
            onChange={(e) => set("vehicle_id", e.target.value)}
            placeholder="e.g. car_04 or truck_04"
            required
          />
        </ModalField>

        <ModalField label="Vehicle Type *">
          <ModalSelect value={form.vehicle_type} onChange={(e) => set("vehicle_type", e.target.value)}>
            {VEHICLE_TYPES.map((t) => (
              <option key={t} value={t}>{TYPE_ICON[t]} {t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </ModalSelect>
        </ModalField>

        <ModalField label="Display Name">
          <ModalInput
            value={form.display_name}
            onChange={(e) => set("display_name", e.target.value)}
            placeholder="Optional friendly name"
          />
        </ModalField>

        <ModalField label="Owner">
          <ModalInput
            value={form.owner}
            onChange={(e) => set("owner", e.target.value)}
            placeholder="Owner / department"
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
            {isPending ? "Registering…" : "Register Vehicle"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Delete confirm modal ──────────────────────────────────────────────────────
function DeleteModal({ open, onClose, vehicle }) {
  const qc = useQueryClient();
  const { mutate, isPending } = useMutation({
    mutationFn: () => deleteVehicle(vehicle?.vehicle_id),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ["vehicles"] }); onClose(); },
  });

  return (
    <Modal open={open} onClose={onClose} title="Remove Vehicle" size="sm">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="text-[#ff3366] shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium" style={{ color: "var(--t1)" }}>
              Deactivate <span className="text-[#ff3366]">{vehicle?.vehicle_id}</span>?
            </p>
            <p className="text-xs" style={{ color: "var(--t4)" }}>
              This soft-deletes the vehicle. All historical sensor readings and anomalies are preserved.
            </p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs transition-colors"
            style={{ backgroundColor: "var(--bg-2)", color: "var(--t3)", border: "1px solid var(--bd)" }}
          >
            Cancel
          </button>
          <button
            onClick={() => mutate()}
            disabled={isPending}
            className="px-4 py-1.5 rounded-lg text-xs font-medium bg-[#ff3366]/15 text-[#ff3366] border border-[#ff3366]/30 hover:bg-[#ff3366]/25 transition-colors disabled:opacity-40"
          >
            {isPending ? "Removing…" : "Deactivate"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Inline edit row ───────────────────────────────────────────────────────────
function VehicleRow({ vehicle, onDelete }) {
  const qc = useQueryClient();
  const { mutate: save, isPending } = useMutation({
    mutationFn: (body) => updateVehicle(vehicle.vehicle_id, body),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ["vehicles"] }); setEditing(false); },
  });

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ display_name: vehicle.display_name ?? "", owner: vehicle.owner ?? "" });
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const statusColor = vehicle.status === "fatal" ? "#ff3366"
    : vehicle.status === "critical"             ? "#ff3366"
    : vehicle.status === "warning"              ? "#ffaa00"
    :                                             "#00ff88";

  return (
    <tr
      className="border-b transition-colors"
      style={{ borderColor: "var(--bd)" }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-2)")}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
    >
      {/* Type */}
      <td className="py-2.5 pl-4 pr-3">
        <span className="text-lg">{TYPE_ICON[vehicle.vehicle_type] ?? "🚗"}</span>
      </td>

      {/* ID */}
      <td className="py-2.5 pr-4">
        <span className="text-xs font-mono font-bold" style={{ color: "var(--t1)" }}>
          {vehicle.vehicle_id}
        </span>
        <div className="text-[10px]" style={{ color: "var(--t4)" }}>{vehicle.vehicle_type}</div>
      </td>

      {/* Display name — inline editable */}
      <td className="py-2.5 pr-4">
        {editing ? (
          <input
            className="as-input text-xs py-0.5 px-2 w-full max-w-[160px]"
            value={form.display_name}
            onChange={(e) => set("display_name", e.target.value)}
          />
        ) : (
          <span className="text-xs" style={{ color: "var(--t2)" }}>
            {vehicle.display_name || <span style={{ color: "var(--t5)" }}>—</span>}
          </span>
        )}
      </td>

      {/* Owner — inline editable */}
      <td className="py-2.5 pr-4">
        {editing ? (
          <input
            className="as-input text-xs py-0.5 px-2 w-full max-w-[140px]"
            value={form.owner}
            onChange={(e) => set("owner", e.target.value)}
          />
        ) : (
          <span className="text-xs" style={{ color: "var(--t2)" }}>
            {vehicle.owner || <span style={{ color: "var(--t5)" }}>—</span>}
          </span>
        )}
      </td>

      {/* Status */}
      <td className="py-2.5 pr-4">
        <span className="text-[10px] font-semibold" style={{ color: statusColor }}>
          ● {vehicle.status}
        </span>
      </td>

      {/* Last seen */}
      <td className="py-2.5 pr-4 text-[10px]" style={{ color: "var(--t5)" }}>
        {vehicle.last_seen
          ? formatDistanceToNow(new Date(vehicle.last_seen), { addSuffix: true })
          : "—"}
      </td>

      {/* Actions */}
      <td className="py-2.5 pr-4">
        <div className="flex items-center gap-1">
          {editing ? (
            <>
              <button
                onClick={() => save(form)}
                disabled={isPending}
                title="Save"
                className="p-1 rounded text-[#00ff88] hover:bg-[#00ff88]/10 transition-colors disabled:opacity-40"
              >
                <Check size={13} />
              </button>
              <button
                onClick={() => setEditing(false)}
                title="Cancel"
                className="p-1 rounded text-[#ff3366] hover:bg-[#ff3366]/10 transition-colors"
              >
                <X size={13} />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => { setForm({ display_name: vehicle.display_name ?? "", owner: vehicle.owner ?? "" }); setEditing(true); }}
                title="Edit"
                className="p-1 rounded transition-colors"
                style={{ color: "var(--t4)" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#3b82f6")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--t4)")}
              >
                <Pencil size={13} />
              </button>
              <button
                onClick={() => onDelete(vehicle)}
                title="Remove"
                className="p-1 rounded transition-colors"
                style={{ color: "var(--t4)" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#ff3366")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--t4)")}
              >
                <Trash2 size={13} />
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function VehicleManage() {
  const [showAdd,    setShowAdd]    = useState(false);
  const [deleteTgt,  setDeleteTgt]  = useState(null);

  const { data: vehicles = [], isLoading } = useQuery({
    queryKey:       ["vehicles"],
    queryFn:         () => getVehicles({ include_inactive: false }),
    refetchInterval: 15000,
  });

  const headers = ["Type", "ID", "Display Name", "Owner", "Status", "Last Seen", "Actions"];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold" style={{ color: "var(--t1)" }}>Vehicle Management</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--t4)" }}>
            {vehicles.length} active vehicle{vehicles.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#3b82f6]/15 text-[#3b82f6] border border-[#3b82f6]/30 hover:bg-[#3b82f6]/25 transition-colors"
        >
          <Plus size={13} /> Add Vehicle
        </button>
      </div>

      {/* Table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ backgroundColor: "var(--bg-1)", border: "1px solid var(--bd)" }}
      >
        {isLoading ? (
          <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
        ) : vehicles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2" style={{ color: "var(--t5)" }}>
            <AlertTriangle size={24} />
            <span className="text-sm">No vehicles registered</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--bd)" }}>
                  {headers.map((h) => (
                    <th
                      key={h}
                      className={clsx("py-3 pr-4 text-left font-medium text-[10px] uppercase tracking-wider", h === "Type" && "pl-4")}
                      style={{ color: "var(--t4)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v) => (
                  <VehicleRow key={v.vehicle_id} vehicle={v} onDelete={setDeleteTgt} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AddVehicleModal  open={showAdd}           onClose={() => setShowAdd(false)} />
      <DeleteModal      open={deleteTgt != null}  onClose={() => setDeleteTgt(null)} vehicle={deleteTgt} />
    </div>
  );
}
