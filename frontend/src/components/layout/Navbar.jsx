import { NavLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Activity, Wifi, WifiOff, Sun, Moon, Volume2, VolumeX } from "lucide-react";
import { getHealth } from "../../services/api";
import { useWebSocket } from "../../hooks/useWebSocket";
import { useAnomalies } from "../../hooks/useAnomalies";
import { useTheme } from "../../context/ThemeContext";
import StatusIndicator from "../ui/StatusIndicator";
import clsx from "clsx";

const NAV_LINKS = [
  { to: "/",                 label: "Overview",    end: true },
  { to: "/monitor",          label: "Live"                   },
  { to: "/anomalies",        label: "History"                },
  { to: "/analytics",        label: "Analytics"              },
  { to: "/vehicles/manage",  label: "Vehicles"               },
  { to: "/maintenance",      label: "Maintenance"            },
  { to: "/map",              label: "Map"                    },
];

export default function Navbar() {
  const { connectionStatus, muted, toggleMute } = useWebSocket();
  const { isDark, toggleTheme } = useTheme();
  const connected = connectionStatus === "connected";

  const { data: health } = useQuery({
    queryKey:       ["health"],
    queryFn:         getHealth,
    refetchInterval: 10000,
  });

  const { data: anomalies = [] } = useAnomalies({ limit: 50 });
  const activeCount = anomalies.filter((a) => !a.resolved).length;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-12
                        bg-[#0a0a0f]/95 backdrop-blur border-b border-[#1e1e2e]
                        flex items-center px-4 gap-4">

      {/* Logo */}
      <div className="flex items-center gap-2 shrink-0">
        <Activity size={17} className="text-[#3b82f6]" />
        <span className="text-sm font-bold tracking-wider text-[#e2e8f0]">
          AUTO<span className="text-[#3b82f6]">SENSE</span>
        </span>
      </div>

      {/* Nav links */}
      <nav className="flex items-center gap-0.5 overflow-x-auto no-scrollbar">
        {NAV_LINKS.map(({ to, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              clsx(
                "px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap",
                isActive
                  ? "bg-[#3b82f6]/15 text-[#3b82f6]"
                  : "text-[#475569] hover:text-[#94a3b8] hover:bg-[#1e1e2e]",
              )
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Right side */}
      <div className="ml-auto flex items-center gap-2 text-xs shrink-0">

        {/* Active anomaly badge */}
        {activeCount > 0 && (
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#ff3366]/15 border border-[#ff3366]/30 text-[#ff3366] font-semibold text-[10px]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#ff3366] animate-ping inline-block" />
            {activeCount} active
          </span>
        )}

        {/* WS status */}
        <span className={clsx("flex items-center gap-1", connected ? "text-[#00ff88]" : "text-[#ff3366]")}>
          {connected ? <Wifi size={11} /> : <WifiOff size={11} />}
          <span className="text-[#64748b] text-[10px]">{connectionStatus}</span>
        </span>

        <StatusIndicator status={health?.db    === "ok" ? "normal" : "critical"} label="DB"    size="sm" />
        <StatusIndicator status={health?.redis === "ok" ? "normal" : "critical"} label="Cache" size="sm" />

        {/* Mute toggle */}
        <button
          onClick={toggleMute}
          title={muted ? "Unmute alerts" : "Mute alerts"}
          className={clsx(
            "p-1.5 rounded-lg transition-colors",
            muted
              ? "text-[#ff3366] hover:bg-[#ff3366]/10"
              : "text-[#475569] hover:text-[#94a3b8] hover:bg-[#1e1e2e]",
          )}
        >
          {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          className="p-1.5 rounded-lg text-[#475569] hover:text-[#94a3b8] hover:bg-[#1e1e2e] transition-colors"
        >
          {isDark ? <Sun size={13} /> : <Moon size={13} />}
        </button>
      </div>
    </header>
  );
}
