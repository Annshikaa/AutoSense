import clsx from "clsx";

const PALETTE = {
  normal:        { ring: "#00ff88", core: "#00ff88" },
  warning:       { ring: "#ffaa00", core: "#ffaa00" },
  critical:      { ring: "#ff3366", core: "#ff3366" },
  fatal:         { ring: "#ff3366", core: "#ff3366" },
  reconnecting:  { ring: "#ffaa00", core: "#ffaa00" },
  disconnected:  { ring: "#475569", core: "#475569" },
  offline:       { ring: "#475569", core: "#475569" },
};

const SIZE = {
  sm: { outer: "w-2 h-2",    inner: "w-2 h-2"    },
  md: { outer: "w-2.5 h-2.5", inner: "w-2.5 h-2.5" },
  lg: { outer: "w-3.5 h-3.5", inner: "w-3.5 h-3.5" },
};

const PULSE_STATUSES = new Set(["critical", "fatal", "warning", "reconnecting"]);

export default function StatusIndicator({ status = "offline", label, size = "md" }) {
  const { ring, core } = PALETTE[status] ?? PALETTE.offline;
  const { outer, inner } = SIZE[size] ?? SIZE.md;
  const shouldPulse = PULSE_STATUSES.has(status);

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={clsx("relative flex shrink-0", outer)}>
        {shouldPulse && (
          <span
            className={clsx("absolute inline-flex h-full w-full rounded-full animate-ping opacity-50")}
            style={{ backgroundColor: ring }}
          />
        )}
        <span
          className={clsx("relative inline-flex rounded-full", inner)}
          style={{
            backgroundColor: core,
            boxShadow: `0 0 6px ${core}88`,
          }}
        />
      </span>
      {label && (
        <span className={clsx(
          "text-xs capitalize",
          status === "normal"   ? "text-[#00ff88]" :
          status === "warning"  ? "text-[#ffaa00]" :
          status === "critical" || status === "fatal" ? "text-[#ff3366]" :
          "text-[#475569]"
        )}>
          {label}
        </span>
      )}
    </span>
  );
}
