import clsx from "clsx";

const CONFIG = {
  normal:   { dot: "bg-[#00ff88]",                    text: "text-[#00ff88]",  border: "border-[#00ff88]/30", bg: "bg-[#00ff88]/10",  pulse: false },
  warning:  { dot: "bg-[#ffaa00]",                    text: "text-[#ffaa00]",  border: "border-[#ffaa00]/30", bg: "bg-[#ffaa00]/10",  pulse: false },
  critical: { dot: "bg-[#ff3366] animate-ping-slow",  text: "text-[#ff3366]",  border: "border-[#ff3366]/40", bg: "bg-[#ff3366]/10",  pulse: true  },
  fatal:    { dot: "bg-[#ff3366] animate-ping-slow",  text: "text-[#ff3366]",  border: "border-[#ff3366]/60", bg: "bg-[#ff3366]/20",  pulse: true  },
  info:     { dot: "bg-[#3b82f6]",                    text: "text-[#3b82f6]",  border: "border-[#3b82f6]/30", bg: "bg-[#3b82f6]/10",  pulse: false },
  muted:    { dot: "bg-[#475569]",                    text: "text-[#94a3b8]",  border: "border-white/10",     bg: "bg-white/5",        pulse: false },
};

export default function Badge({ severity = "muted", children, className }) {
  const c = CONFIG[severity] ?? CONFIG.muted;

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-widest",
        c.bg, c.border, c.text,
        c.pulse && "animate-pulse",
        className,
      )}
    >
      {/* dot */}
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        {c.pulse && (
          <span className={clsx("absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping", c.dot)} />
        )}
        <span className={clsx("relative inline-flex rounded-full h-1.5 w-1.5", c.dot.split(" ")[0])} />
      </span>
      {children ?? severity}
    </span>
  );
}
