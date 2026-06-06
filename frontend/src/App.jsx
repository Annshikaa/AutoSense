import { Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { WebSocketProvider } from "./context/WebSocketContext";
import Navbar         from "./components/layout/Navbar";
import Overview       from "./pages/Overview";
import LiveMonitor    from "./pages/LiveMonitor";
import AnomalyHistory from "./pages/AnomalyHistory";
import Analytics      from "./pages/Analytics";
import VehicleManage  from "./pages/VehicleManage";
import Maintenance    from "./pages/Maintenance";
import LiveMap        from "./pages/LiveMap";

function AppInner() {
  const { isDark } = useTheme();
  return (
    <div
      className="min-h-screen transition-colors duration-200"
      style={{ backgroundColor: "var(--bg-0)", color: "var(--t1)" }}
    >
      <Navbar />
      <main className="pt-12">
        <div className="max-w-7xl mx-auto px-4 py-5">
          <Routes>
            <Route path="/"                   element={<Overview />} />
            <Route path="/monitor"            element={<LiveMonitor />} />
            <Route path="/monitor/:vehicleId" element={<LiveMonitor />} />
            <Route path="/anomalies"          element={<AnomalyHistory />} />
            <Route path="/analytics"          element={<Analytics />} />
            <Route path="/vehicles/manage"    element={<VehicleManage />} />
            <Route path="/maintenance"        element={<Maintenance />} />
            <Route path="/map"                element={<LiveMap />} />
            <Route path="*"                   element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <WebSocketProvider>
        <AppInner />
      </WebSocketProvider>
    </ThemeProvider>
  );
}
