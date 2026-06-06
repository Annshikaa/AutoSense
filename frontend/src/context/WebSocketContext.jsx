import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";

// ── Web Audio API — 3-tier sound system ───────────────────────────────────────

function _audioCtx() {
  try { return new (window.AudioContext || window.webkitAudioContext)(); }
  catch { return null; }
}

function _beep(ctx, freq, start, dur, vol = 0.07) {
  if (!ctx) return;
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, ctx.currentTime + start);
  gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + dur + 0.02);
}

function playWarning() {
  const c = _audioCtx();
  _beep(c, 440, 0, 0.18, 0.07);
}

function playCritical() {
  const c = _audioCtx();
  _beep(c, 660, 0,    0.15, 0.10);
  _beep(c, 660, 0.22, 0.15, 0.10);
}

function playFatalAlarm() {
  const c = _audioCtx();
  if (!c) return;
  // Three-pulse harsh alarm: 880/660 pairs
  [[0, 880], [0.05, 660], [0.28, 880], [0.33, 660], [0.56, 880], [0.61, 660]].forEach(([t, f]) => {
    _beep(c, f, t, 0.18, 0.13);
  });
}

// ── Browser notification ──────────────────────────────────────────────────────
let _notifPerm = Notification?.permission ?? "default";
function requestNotifPerm() {
  if (typeof Notification === "undefined") return;
  if (_notifPerm === "default") Notification.requestPermission().then((p) => { _notifPerm = p; });
}
function showNotification(title, body) {
  if (_notifPerm !== "granted") return;
  try { new Notification(title, { body, icon: "/favicon.svg", silent: true }); } catch {}
}

// ── Context ───────────────────────────────────────────────────────────────────
const WebSocketContext = createContext(null);
const WS_URL          = "ws://localhost:8000/ws/live/all";
const RECONNECT_DELAY = 3000;
const MAX_ANOMALIES   = 50;

export function WebSocketProvider({ children }) {
  const [latestReadings,   setLatestReadings]   = useState({});
  const [latestAnomalies,  setLatestAnomalies]  = useState([]);
  const [connectionStatus, setConnectionStatus] = useState("disconnected");
  const [muted, setMuted] = useState(() => {
    try { return localStorage.getItem("autosense-muted") === "true"; } catch { return false; }
  });

  const wsRef        = useRef(null);
  const retryRef     = useRef(null);
  const mutedRef     = useRef(muted);
  const activeFatals = useRef(new Set());  // unacknowledged fatal anomaly IDs
  const alarmRef     = useRef(null);

  useEffect(() => { mutedRef.current = muted; }, [muted]);

  function stopAlarm() {
    clearInterval(alarmRef.current);
    alarmRef.current = null;
  }

  function startAlarm() {
    if (alarmRef.current) return;
    if (!mutedRef.current) playFatalAlarm();
    alarmRef.current = setInterval(() => {
      if (mutedRef.current || activeFatals.current.size === 0) {
        stopAlarm();
      } else {
        playFatalAlarm();
      }
    }, 4500);
  }

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      mutedRef.current = next;
      try { localStorage.setItem("autosense-muted", next); } catch {}
      if (next) stopAlarm();
      return next;
    });
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    setConnectionStatus("reconnecting");
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus("connected");
      clearTimeout(retryRef.current);
      requestNotifPerm();
    };

    ws.onmessage = (evt) => {
      let msg;
      try { msg = JSON.parse(evt.data); } catch { return; }

      // ── Sensor update ──────────────────────────────────────────────────────
      if (msg.type === "sensor_update") {
        const { fault_active = false, fault_type = null, ...sensorValues } = msg.sensors ?? {};
        setLatestReadings((prev) => ({
          ...prev,
          [msg.vehicle_id]: { sensors: sensorValues, fault_active, fault_type, vehicle_type: msg.vehicle_type ?? null, ts: msg.ts },
        }));
      }

      // ── New anomaly ────────────────────────────────────────────────────────
      if (msg.type === "anomaly") {
        const id = msg.anomaly_id;
        if (!mutedRef.current) {
          if      (msg.severity === "fatal")    { activeFatals.current.add(id); startAlarm(); }
          else if (msg.severity === "critical") playCritical();
          else                                  playWarning();
        }
        if (msg.severity === "fatal") {
          showNotification(`FATAL — ${msg.vehicle_id}`, `${msg.anomaly_type}  IF:${msg.if_score?.toFixed(3)}`);
        }
        setLatestAnomalies((prev) =>
          [{ ...msg, id }, ...prev.filter((a) => a.id !== id)].slice(0, MAX_ANOMALIES)
        );
      }

      // ── Anomaly acknowledged ───────────────────────────────────────────────
      if (msg.type === "anomaly_acknowledged") {
        activeFatals.current.delete(msg.anomaly_id);
        if (activeFatals.current.size === 0) stopAlarm();
        setLatestAnomalies((prev) =>
          prev.map((a) => a.id === msg.anomaly_id
            ? { ...a, acknowledged: true, acknowledged_by: msg.acknowledged_by }
            : a
          )
        );
      }

      // ── Anomaly resolved ───────────────────────────────────────────────────
      if (msg.type === "anomaly_resolved") {
        activeFatals.current.delete(msg.anomaly_id);
        if (activeFatals.current.size === 0) stopAlarm();
        setLatestAnomalies((prev) =>
          prev.map((a) => a.id === msg.anomaly_id
            ? { ...a, resolved: true, resolved_by: msg.resolved_by }
            : a
          )
        );
      }

      // ── New comment (just for live-state merge, no sound) ──────────────────
      // comments are fetched from DB on demand — nothing to do here
    };

    ws.onclose = () => {
      setConnectionStatus("disconnected");
      retryRef.current = setTimeout(connect, RECONNECT_DELAY);
    };
    ws.onerror = () => ws.close();
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(retryRef.current);
      stopAlarm();
      wsRef.current?.close();
    };
  }, [connect]);

  return (
    <WebSocketContext.Provider value={{ latestReadings, latestAnomalies, connectionStatus, muted, toggleMute }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocketContext() {
  const ctx = useContext(WebSocketContext);
  if (!ctx) throw new Error("useWebSocketContext must be inside WebSocketProvider");
  return ctx;
}
