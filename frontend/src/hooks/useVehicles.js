import { useQuery } from "@tanstack/react-query";
import { getVehicles, getVehicle } from "../services/api";
import { useWebSocket } from "./useWebSocket";

/**
 * All vehicles from API, merged with live WebSocket sensor values.
 * Each vehicle gets a `live` property with the latest WS reading.
 */
export function useVehicles() {
  const { latestReadings } = useWebSocket();

  const query = useQuery({
    queryKey:       ["vehicles"],
    queryFn:        getVehicles,
    refetchInterval: 8000,
    staleTime:       5000,
  });

  const vehicles = (query.data ?? []).map((v) => ({
    ...v,
    live: latestReadings[v.vehicle_id] ?? null,
  }));

  return { ...query, data: vehicles };
}

/**
 * Single vehicle from API, merged with live WebSocket sensor values.
 */
export function useVehicle(id) {
  const { latestReadings } = useWebSocket();

  const query = useQuery({
    queryKey:        ["vehicle", id],
    queryFn:         () => getVehicle(id),
    refetchInterval:  5000,
    enabled:          !!id,
  });

  const data = query.data
    ? { ...query.data, live: latestReadings[id] ?? null }
    : null;

  return { ...query, data };
}
