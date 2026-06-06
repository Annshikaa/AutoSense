/**
 * Thin consumer hook — reads from the shared WebSocketContext.
 *
 * Returns:
 *   latestReadings   — { vehicle_1: { sensors, fault_active, fault_type, ts }, … }
 *   latestAnomalies  — last 50 anomaly WS events, newest first
 *   connectionStatus — "connected" | "disconnected" | "reconnecting"
 */
export { useWebSocketContext as useWebSocket } from "../context/WebSocketContext";
