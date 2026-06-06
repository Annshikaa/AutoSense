import { useEffect } from "react";
import { X } from "lucide-react";

const SIZE = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-2xl", xl: "max-w-4xl" };

export default function Modal({ open, onClose, title, children, size = "md" }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Dialog */}
      <div
        className={`relative w-full ${SIZE[size] ?? SIZE.md} rounded-xl shadow-2xl animate-slide-in`}
        style={{ backgroundColor: "var(--bg-1)", border: "1px solid var(--bd)" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3.5"
          style={{ borderBottom: "1px solid var(--bd)" }}
        >
          <h2 className="text-sm font-bold" style={{ color: "var(--t1)" }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded transition-colors"
            style={{ color: "var(--t4)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--t1)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--t4)")}
          >
            <X size={15} />
          </button>
        </div>
        {/* Body */}
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// Convenience sub-components used inside modals
export function ModalField({ label, children }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium" style={{ color: "var(--t3)" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

export function ModalInput(props) {
  return (
    <input
      {...props}
      className={`w-full as-input ${props.className ?? ""}`}
    />
  );
}

export function ModalSelect({ children, ...props }) {
  return (
    <select
      {...props}
      className="w-full as-input cursor-pointer"
    >
      {children}
    </select>
  );
}

export function ModalTextarea(props) {
  return (
    <textarea
      {...props}
      rows={props.rows ?? 3}
      className={`w-full as-input resize-none ${props.className ?? ""}`}
    />
  );
}
