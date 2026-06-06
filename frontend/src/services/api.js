import axios from "axios";

const http = axios.create({
  baseURL: "http://localhost:8000",
  timeout: 8000,
  headers: { "Content-Type": "application/json" },
});

// ── Vehicles ──────────────────────────────────────────────────────────────────
export const getVehicles = (params = {}) =>
  http.get("/api/vehicles", { params }).then((r) => r.data);

export const getVehicle = (id) =>
  http.get(`/api/vehicles/${id}`).then((r) => r.data);

export const registerVehicle = (body) =>
  http.post("/api/vehicles/register", body).then((r) => r.data);

export const updateVehicle = (id, body) =>
  http.patch(`/api/vehicles/${id}`, body).then((r) => r.data);

export const deleteVehicle = (id) =>
  http.delete(`/api/vehicles/${id}`).then((r) => r.data);

export const getVehicleTypes = () =>
  http.get("/api/vehicles/types").then((r) => r.data);

// ── Sensors ───────────────────────────────────────────────────────────────────
export const getSensorHistory = (vehicleId, limit = 120) =>
  http.get(`/api/sensors/${vehicleId}/history`, { params: { limit } }).then((r) => r.data);

// ── Anomalies ─────────────────────────────────────────────────────────────────
export const getAnomalies = (params = {}) =>
  http.get("/api/anomalies", { params }).then((r) => r.data);

export const getActiveAnomalies = (params = {}) =>
  http.get("/api/anomalies/active", { params }).then((r) => r.data);

// Quick resolve — passes a default resolved_by for one-click actions
export const resolveAnomaly = (id) =>
  http.patch(`/api/anomalies/${id}/resolve`, { resolved_by: "operator" }).then((r) => r.data);

// Full resolve with user-provided body
export const resolveAnomalyFull = (id, body) =>
  http.patch(`/api/anomalies/${id}/resolve`, body).then((r) => r.data);

export const acknowledgeAnomaly = (id, body) =>
  http.patch(`/api/anomalies/${id}/acknowledge`, body).then((r) => r.data);

export const addAnomalyComment = (id, body) =>
  http.post(`/api/anomalies/${id}/comment`, body).then((r) => r.data);

// ── Maintenance ───────────────────────────────────────────────────────────────
export const getMaintenance = (params = {}) =>
  http.get("/api/maintenance", { params }).then((r) => r.data);

export const createMaintenance = (body) =>
  http.post("/api/maintenance", body).then((r) => r.data);

export const getMaintenanceSummary = (vehicleId) =>
  http.get(`/api/maintenance/${vehicleId}/summary`).then((r) => r.data);

export const getMaintenanceExport = (vehicleId) =>
  http.get(`/api/maintenance/export/${vehicleId}`).then((r) => r.data);

// ── Analytics ─────────────────────────────────────────────────────────────────
export const getAnalyticsSummary = () =>
  http.get("/api/analytics/summary").then((r) => r.data);

export const getSummary = getAnalyticsSummary; // alias for existing pages

export const getHeatmap = () =>
  http.get("/api/analytics/heatmap").then((r) => r.data);

// ── Health ────────────────────────────────────────────────────────────────────
export const getHealth = () =>
  http.get("/health").then((r) => r.data);

// ── PDF / Print report ────────────────────────────────────────────────────────
export async function printVehicleReport(vehicleId) {
  const data = await getMaintenanceExport(vehicleId);
  const v = data.vehicle ?? {};
  const s = data.summary ?? {};
  const logs = data.logs ?? [];

  const html = `<!DOCTYPE html><html>
<head>
  <meta charset="UTF-8">
  <title>AutoSense Report — ${vehicleId}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 32px; color: #1e293b; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    .sub { color: #64748b; font-size: 12px; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 12px; }
    th { text-align: left; padding: 6px 8px; background: #f8fafc; border-bottom: 2px solid #e2e8f0; }
    td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; }
    .kpi { display: flex; gap: 24px; margin-bottom: 20px; }
    .kv  { background: #f8fafc; border-radius: 8px; padding: 12px 16px; }
    .kv .k { font-size: 11px; color: #64748b; text-transform: uppercase; }
    .kv .v { font-size: 20px; font-weight: bold; color: #0f172a; }
    @media print { body { padding: 16px; } }
  </style>
</head>
<body>
  <h1>AutoSense Health Report — ${v.vehicle_id ?? vehicleId}</h1>
  <div class="sub">
    Type: ${v.vehicle_type ?? "—"} &nbsp;|&nbsp; Owner: ${v.owner ?? "—"} &nbsp;|&nbsp;
    Odometer: ${v.odometer ?? "—"} km &nbsp;|&nbsp;
    Generated: ${new Date().toLocaleString()}
  </div>
  <div class="kpi">
    <div class="kv"><div class="k">Total Logs</div><div class="v">${s.total_logs ?? 0}</div></div>
    <div class="kv"><div class="k">Total Cost</div><div class="v">$${s.total_cost ?? 0}</div></div>
    <div class="kv"><div class="k">Last Service</div><div class="v">${s.last_service_date ? new Date(s.last_service_date).toLocaleDateString() : "—"}</div></div>
    <div class="kv"><div class="k">Top Fault</div><div class="v">${s.most_common_fault_type ?? "—"}</div></div>
  </div>
  <h2 style="font-size:14px;margin-bottom:8px;">Maintenance History</h2>
  <table>
    <thead>
      <tr><th>Date</th><th>Type</th><th>Title</th><th>Technician</th><th>Cost</th></tr>
    </thead>
    <tbody>
      ${logs.map((l) => `
        <tr>
          <td>${new Date(l.created_at).toLocaleDateString()}</td>
          <td>${l.log_type}</td>
          <td>${l.title}</td>
          <td>${l.technician}</td>
          <td>${l.cost != null ? "$" + l.cost.toFixed(2) : "—"}</td>
        </tr>`).join("")}
    </tbody>
  </table>
</body></html>`;

  const win = window.open("", "_blank");
  if (!win) { alert("Allow pop-ups to generate the report."); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}
