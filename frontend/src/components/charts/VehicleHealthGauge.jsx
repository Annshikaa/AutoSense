import { useEffect, useRef, useState } from "react";

function scoreColor(score) {
  if (score >= 70) return "#00ff88";
  if (score >= 40) return "#ffaa00";
  return "#ff3366";
}

function calcScore(activeFaults, recentAnomalies) {
  return Math.max(0, Math.min(100, 100 - activeFaults * 25 - recentAnomalies * 5));
}

export default function VehicleHealthGauge({
  activeFaults    = 0,
  recentAnomalies = 0,
  size            = 100,
  showLabel       = true,
}) {
  const score = calcScore(activeFaults, recentAnomalies);
  const color = scoreColor(score);

  // Smooth animated counter
  const [display, setDisplay] = useState(score);
  const prevScore = useRef(score);

  useEffect(() => {
    const start    = prevScore.current;
    const end      = score;
    if (start === end) return;
    prevScore.current = end;

    const duration  = 600;
    const startTime = performance.now();
    const step = (now) => {
      const t     = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(start + (end - start) * eased));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [score]);

  const r    = (size / 2) * 0.80;
  const sw   = size * 0.09;
  const circ = 2 * Math.PI * r;
  const pct  = display / 100;

  return (
    <div className="flex flex-col items-center gap-1">
      {/* Gauge — wrapper provides the positioning context */}
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          style={{ transform: "rotate(-90deg)", display: "block" }}
        >
          {/* Track */}
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none"
            stroke="#1e1e2e"
            strokeWidth={sw}
          />
          {/* Filled arc */}
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none"
            stroke={color}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - pct)}
            style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.4s ease" }}
          />
        </svg>

        {/* Centred text — absolutely positioned OVER the SVG */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="font-bold tabular-nums leading-none"
            style={{
              color,
              fontSize: size * 0.22,
              transition: "color 0.4s",
            }}
          >
            {display}
          </span>
          <span
            className="uppercase tracking-wider text-[#475569] leading-none mt-0.5"
            style={{ fontSize: size * 0.09 }}
          >
            health
          </span>
        </div>
      </div>

      {showLabel && (
        <span
          className="text-[10px] font-semibold uppercase tracking-wide"
          style={{ color }}
        >
          {score >= 70 ? "Good" : score >= 40 ? "Degraded" : "Critical"}
        </span>
      )}
    </div>
  );
}
