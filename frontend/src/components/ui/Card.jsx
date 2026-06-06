import clsx from "clsx";

export default function Card({ children, className, glow }) {
  return (
    <div
      className={clsx(
        "rounded-xl border border-[#1e1e2e] bg-[#12121a] p-4",
        glow && "shadow-[0_0_24px_rgba(59,130,246,0.08)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div>
        <h3 className="text-sm font-semibold text-[#e2e8f0]">{title}</h3>
        {subtitle && <p className="text-xs text-[#64748b] mt-0.5">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
