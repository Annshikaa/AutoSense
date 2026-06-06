import { useState } from "react";
import clsx from "clsx";

const ALL_VEHICLES = [
  "car_01", "car_02", "car_03",
  "truck_01", "truck_02", "truck_03",
  "bus_01", "bus_02", "bus_03",
  "ambulance_01",
];

function cellStyle(count, max) {
  if (!count || !max) return { bg: "#1e1e2e", text: "#334155", intensity: 0 };
  const ratio = count / max;
  if (ratio > 0.75) return { bg: "rgba(255,51,102,0.65)",  text: "#fff",     intensity: ratio };
  if (ratio > 0.45) return { bg: "rgba(255,170,0,0.55)",   text: "#fff",     intensity: ratio };
  if (ratio > 0.15) return { bg: "rgba(59,130,246,0.45)",  text: "#e2e8f0",  intensity: ratio };
  return               { bg: "rgba(0,255,136,0.18)",  text: "#00ff88",  intensity: ratio };
}

function Tooltip({ count, vehicle, faultType, visible }) {
  if (!visible) return null;
  return (
    <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2
                    bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-2.5 py-1.5
                    text-xs shadow-2xl whitespace-nowrap pointer-events-none">
      <p className="text-[#94a3b8] font-semibold">{vehicle}</p>
      <p className="text-[#64748b]">{faultType}</p>
      <p className="text-[#e2e8f0] font-bold mt-0.5">{count} occurrences</p>
      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#1e1e2e]" />
    </div>
  );
}

function HeatCell({ count, max, vehicle, faultType }) {
  const [hovered, setHovered] = useState(false);
  const style = cellStyle(count, max);

  return (
    <td className="px-1 py-1">
      <div
        className="relative flex items-center justify-center rounded cursor-default select-none"
        style={{ width: 44, height: 30, background: style.bg, transition: "transform 0.15s" }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <span className="text-[11px] font-bold" style={{ color: style.text }}>
          {count || "·"}
        </span>
        <Tooltip count={count} vehicle={vehicle} faultType={faultType} visible={hovered && count > 0} />
      </div>
    </td>
  );
}

export default function AnomalyHeatmap({ data = {} }) {
  const faultTypes = data.fault_types ?? [];
  const totals     = data.totals ?? {};
  const maxVal     = Math.max(...Object.values(totals), 1);
  // Only show rows for vehicles that have data, fall back to full list
  const activeVehicles = ALL_VEHICLES.filter((v) =>
    faultTypes.some((ft) => (data[v]?.[ft] ?? 0) > 0) || Object.keys(data).includes(v)
  );

  if (!faultTypes.length) {
    return (
      <div className="flex items-center justify-center h-28 text-[#334155] text-sm">
        No fault data recorded yet
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-xs">
        <thead>
          <tr>
            <th className="text-left text-[#334155] font-normal pb-3 pr-4 w-24">Vehicle</th>
            {faultTypes.map((ft) => (
              <th key={ft} className="text-[#475569] font-normal pb-3 px-1 text-center">
                <span className="block text-[10px] leading-tight">
                  {ft.replace("_FAULT", "")}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {activeVehicles.map((vid) => (
            <tr key={vid}>
              <td className="text-[#94a3b8] py-1 pr-4 font-medium text-[11px]">
                {vid}
              </td>
              {faultTypes.map((ft) => (
                <HeatCell
                  key={ft}
                  count={data[vid]?.[ft] ?? 0}
                  max={maxVal}
                  vehicle={vid}
                  faultType={ft}
                />
              ))}
            </tr>
          ))}

          {/* Totals row */}
          <tr>
            <td className="text-[#334155] pt-2 pr-4 border-t border-[#1e1e2e] text-[10px]">Total</td>
            {faultTypes.map((ft) => (
              <td key={ft} className="pt-2 px-1 text-center border-t border-[#1e1e2e]">
                <span className="text-[11px] font-bold text-[#64748b]">{totals[ft] ?? 0}</span>
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-4 text-[10px] text-[#475569]">
        <span>Intensity:</span>
        {[
          { bg: "rgba(0,255,136,0.18)",  label: "Low"    },
          { bg: "rgba(59,130,246,0.45)", label: "Medium" },
          { bg: "rgba(255,170,0,0.55)",  label: "High"   },
          { bg: "rgba(255,51,102,0.65)", label: "Severe" },
        ].map(({ bg, label }) => (
          <span key={label} className="flex items-center gap-1">
            <span className="w-4 h-3 rounded-sm inline-block" style={{ background: bg }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
