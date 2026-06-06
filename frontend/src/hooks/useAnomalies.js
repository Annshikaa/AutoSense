import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getAnomalies, resolveAnomaly, resolveAnomalyFull,
  acknowledgeAnomaly, addAnomalyComment,
} from "../services/api";
import { useWebSocket } from "./useWebSocket";

export function useAnomalies(params = {}) {
  const { latestAnomalies } = useWebSocket();

  const query = useQuery({
    queryKey:       ["anomalies", params],
    queryFn:        () => getAnomalies(params),
    refetchInterval: 8000,
    staleTime:       5000,
  });

  const merged = useMemo(() => {
    const dbList = query.data ?? [];
    const map    = new Map(dbList.map((a) => [a.id, a]));

    latestAnomalies.forEach((ws) => {
      const wsId = ws.id ?? ws.anomaly_id;
      if (wsId && !map.has(wsId)) {
        map.set(wsId, {
          id:              wsId,
          vehicle_id:      ws.vehicle_id,
          anomaly_type:    ws.anomaly_type,
          severity:        ws.severity,
          if_score:        ws.if_score,
          lstm_error:      ws.lstm_error,
          sensor_values:   ws.sensor_values ?? {},
          resolved:        ws.resolved ?? false,
          acknowledged:    ws.acknowledged ?? false,
          acknowledged_by: ws.acknowledged_by ?? null,
          acknowledged_at: ws.acknowledged_at ?? null,
          created_at:      ws.created_at,
        });
      } else if (wsId && map.has(wsId)) {
        // Merge live state updates (ack/resolve via WS) into DB record
        const existing = map.get(wsId);
        if (ws.acknowledged && !existing.acknowledged) {
          map.set(wsId, { ...existing, acknowledged: true, acknowledged_by: ws.acknowledged_by });
        }
        if (ws.resolved && !existing.resolved) {
          map.set(wsId, { ...existing, resolved: true, resolved_by: ws.resolved_by });
        }
      }
    });

    return [...map.values()].sort(
      (a, b) => new Date(b.created_at ?? 0) - new Date(a.created_at ?? 0),
    );
  }, [query.data, latestAnomalies]);

  return { ...query, data: merged };
}

// Quick resolve (one-click, default resolved_by)
export function useResolveAnomaly() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => resolveAnomaly(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["anomalies"] }),
  });
}

// Full resolve with modal body
export function useResolveAnomalyFull() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }) => resolveAnomalyFull(id, body),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["anomalies"] }),
  });
}

export function useAcknowledgeAnomaly() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, acknowledged_by }) => acknowledgeAnomaly(id, { acknowledged_by }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["anomalies"] }),
  });
}

export function useAddComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }) => addAnomalyComment(id, body),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["anomalies"] }),
  });
}
