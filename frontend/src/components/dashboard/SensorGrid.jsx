import Card from "../ui/Card";
import SensorLineChart from "../charts/SensorLineChart";
import { useWebSocketContext } from "../../context/WebSocketContext";

const BASE_SENSORS = {
  rpm:         "#3b82f6",
  speed:       "#00ff88",
  temperature: "#ffaa00",
  throttle:    "#a855f7",
  battery:     "#06b6d4",
};

const EXTRA_SENSOR_COLOR = {
  fuel_level:   "#f97316",
  load_weight:  "#eab308",
  door_status:  "#ec4899",
  siren_active: "#ef4444",
};

export default function SensorGrid({ vehicleId, initialData = [] }) {
  const { latestReadings } = useWebSocketContext();
  const reading = latestReadings[vehicleId];

  // Detect extra sensor from live data keys (anything not in BASE_SENSORS)
  const extraKey = reading?.sensors
    ? Object.keys(reading.sensors).find((k) => !(k in BASE_SENSORS))
    : null;

  const sensors = { ...BASE_SENSORS };
  if (extraKey) {
    sensors[extraKey] = EXTRA_SENSOR_COLOR[extraKey] ?? "#94a3b8";
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
      {Object.entries(sensors).map(([sensor, color]) => (
        <Card key={sensor} className="min-w-0">
          <SensorLineChart
            vehicleId={vehicleId}
            sensorName={sensor}
            color={color}
            initialData={initialData}
          />
        </Card>
      ))}
    </div>
  );
}
