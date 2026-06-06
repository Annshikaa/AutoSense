"""
edge-ai/test_receiver.py
Validates the C++ ECU simulator -> Python UDP pipeline.

Usage:
    pip install colorama
    python test_receiver.py          (while ecu-simulator.exe is running)
"""

import socket
import json
import time
import threading
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Dict

try:
    from colorama import init, Fore, Style
    init(autoreset=True)
except ImportError:
    sys.exit("colorama is required:  pip install colorama")

# ── Config ───────────────────────────────────────────────────────────────────
UDP_HOST    = "0.0.0.0"
UDP_PORT    = 5000
RUN_SECONDS = 15
BUF_SIZE    = 65535
VEHICLES    = ["vehicle_1", "vehicle_2", "vehicle_3"]
SENSOR_KEYS = ["rpm", "speed", "temperature", "throttle", "battery"]
UNITS       = {"rpm": "RPM", "speed": "km/h", "temperature": "C",
               "throttle": "%", "battery": "V"}

# ── Per-vehicle accumulator ───────────────────────────────────────────────────
@dataclass
class VehicleStats:
    packets:      int   = 0
    faults:       int   = 0
    fault_types:  dict  = field(default_factory=lambda: defaultdict(int))
    totals:       dict  = field(default_factory=lambda: defaultdict(float))
    minimums:     dict  = field(default_factory=dict)
    maximums:     dict  = field(default_factory=dict)
    last:         dict  = field(default_factory=dict)
    fault_active: bool  = False
    fault_type:   str   = ""

    def ingest(self, sensors: dict, fault_active: bool, fault_type: str):
        self.packets     += 1
        self.fault_active = fault_active
        self.fault_type   = fault_type
        if fault_active:
            self.faults += 1
            self.fault_types[fault_type] += 1
        for k, v in sensors.items():
            self.totals[k] += v
            self.last[k]    = v
            if k not in self.minimums or v < self.minimums[k]:
                self.minimums[k] = v
            if k not in self.maximums or v > self.maximums[k]:
                self.maximums[k] = v

# ── Shared state ──────────────────────────────────────────────────────────────
_lock         = threading.Lock()
_vstats:      Dict[str, VehicleStats] = {}
_total_pkts   = 0
_pps_window:  list = []          # monotonic timestamps within last 1 s

def _receiver_loop(sock: socket.socket, stop: threading.Event):
    global _total_pkts
    sock.settimeout(0.3)
    while not stop.is_set():
        try:
            data, _ = sock.recvfrom(BUF_SIZE)
        except socket.timeout:
            continue
        try:
            pkt = json.loads(data.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            continue

        vid     = pkt.get("vehicle_id", "unknown")
        sensors = pkt.get("sensors", {})
        fa      = pkt.get("fault_active", False)
        ft      = pkt.get("fault_type",   "")

        with _lock:
            if vid not in _vstats:
                _vstats[vid] = VehicleStats()
            _vstats[vid].ingest(sensors, fa, ft)
            _total_pkts += 1
            now = time.monotonic()
            _pps_window.append(now)
            cutoff = now - 1.0
            while _pps_window and _pps_window[0] < cutoff:
                _pps_window.pop(0)

# ── Colours ───────────────────────────────────────────────────────────────────
C  = Fore.CYAN  + Style.BRIGHT   # borders / header
W  = Fore.WHITE + Style.BRIGHT   # header text
G  = Fore.GREEN                  # normal rows
R  = Fore.RED   + Style.BRIGHT   # fault rows
Y  = Fore.YELLOW + Style.BRIGHT  # status bar
Z  = Style.RESET_ALL

# ── Table renderer ────────────────────────────────────────────────────────────
_TABLE_WIDTH = 72   # visible characters
_prev_lines  = 0

def _build_table(elapsed: int) -> list:
    lines = []

    with _lock:
        snap   = {k: v for k, v in sorted(_vstats.items())}
        pps    = len(_pps_window)
        total  = _total_pkts
        faults = sum(v.faults for v in snap.values())

    top    = "╔" + "═" * _TABLE_WIDTH + "╗"
    sep    = "╠" + "═" * _TABLE_WIDTH + "╣"
    bot    = "╚" + "═" * _TABLE_WIDTH + "╝"
    hdr    = ("  {:<12}│{:^9}│{:^9}│{:^9}│{:^7}│{:^9}│ {}"
              .format("vehicle_id", "RPM", "Speed", "Temp", "Thr", "Bat", "Status"))

    lines += [
        C + top + Z,
        C + "║" + Z + W + hdr + Z + C + "  ║" + Z,
        C + sep + Z,
    ]

    for vid in VEHICLES:
        if vid not in snap:
            inner = f"  {vid:<12}│" + "  (no data yet)" + " " * 46
            lines.append(C + "║" + Z + Fore.WHITE + inner + Z + C + "  ║" + Z)
            continue

        vs    = snap[vid]
        s     = vs.last
        rpm   = s.get("rpm",         0.0)
        speed = s.get("speed",       0.0)
        temp  = s.get("temperature", 0.0)
        thr   = s.get("throttle",    0.0)
        bat   = s.get("battery",     0.0)

        inner = ("  {:<12}│{:^9.1f}│{:^9.1f}│{:^9.1f}│{:>5.1f}% │{:>7.2f}V │"
                 .format(vid, rpm, speed, temp, thr, bat))

        if vs.fault_active:
            status = f" !! {vs.fault_type} !!"
            lines.append(C + "║" + Z + R + inner + status + Z + C + "  ║" + Z)
        else:
            lines.append(C + "║" + Z + G + inner + " OK" + Z + C + "  ║" + Z)

    remaining = max(0, RUN_SECONDS - elapsed)
    lines.append(C + bot + Z)
    lines.append(
        Y +
        f"  Packets received: {total:>4}  |  Rate: {pps:>3}/sec  |"
        f"  Faults detected: {faults:>3}  |  Time left: {remaining:>2}s"
        + Z
    )
    return lines


def _render(elapsed: int):
    global _prev_lines
    lines = _build_table(elapsed)

    # Move cursor up to overwrite previous frame
    if _prev_lines:
        sys.stdout.write(f"\033[{_prev_lines}A")

    for line in lines:
        sys.stdout.write(f"\033[2K{line}\n")
    sys.stdout.flush()
    _prev_lines = len(lines)


# ── Summary ───────────────────────────────────────────────────────────────────
def _print_summary():
    hr = C + "═" * 68 + Z
    print(f"\n{hr}")
    print(C + "  15-SECOND SUMMARY  —  C++ ECU Simulator → Python UDP Pipeline" + Z)
    print(hr)

    with _lock:
        snap = dict(_vstats)

    all_ok = True
    for vid in VEHICLES:
        if vid not in snap:
            print(f"\n  {R}{vid}{Z}  — NO DATA RECEIVED")
            all_ok = False
            continue

        vs = snap[vid]
        fault_pct = 100.0 * vs.faults / max(vs.packets, 1)
        print(f"\n  {W}{vid}{Z}")
        print(f"    Packets received : {vs.packets}")
        print(f"    Fault packets    : {vs.faults}  ({fault_pct:.1f}%)")
        for ft, cnt in sorted(vs.fault_types.items()):
            print(f"      └─ {ft}: {cnt}x")

        print(f"\n    {'Sensor':<16} {'Average':>10} {'Min':>10} {'Max':>10}")
        print(f"    {'──────':<16} {'───────':>10} {'───':>10} {'───':>10}")
        for k in SENSOR_KEYS:
            if k not in vs.totals:
                continue
            avg = vs.totals[k] / vs.packets
            mn  = vs.minimums[k]
            mx  = vs.maximums[k]
            u   = UNITS.get(k, "")
            print(f"    {k:<16} {avg:>9.2f}{u:4}  {mn:>9.2f}  {mx:>9.2f}")

    total_p = sum(v.packets for v in snap.values())
    total_f = sum(v.faults  for v in snap.values())
    seen    = sorted(snap.keys())

    print(f"\n{hr}")
    print(f"  Total packets : {total_p}")
    print(f"  Total faults  : {total_f}")
    print(f"  Vehicles seen : {', '.join(seen)}")

    pipeline_ok = all_ok and set(seen) == set(VEHICLES) and total_p > 0
    if pipeline_ok:
        print(Fore.GREEN + Style.BRIGHT +
              "\n  PASS  C++ ECU Simulator -> Python UDP pipeline confirmed." + Z)
    else:
        print(R + "\n  FAIL  Not all 3 vehicles were seen. Is the simulator running?" + Z)
    print(hr + "\n")


# ── Entry point ───────────────────────────────────────────────────────────────
def main():
    print(C +
          "\n╔══════════════════════════════════════════════════╗\n"
           "║   AutoSense UDP Test Receiver  (edge-ai layer)   ║\n"
          f"║   Listening on {UDP_HOST}:{UDP_PORT}  |  {RUN_SECONDS}s run             ║\n"
           "╚══════════════════════════════════════════════════╝\n"
          + Z)

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        sock.bind((UDP_HOST, UDP_PORT))
    except OSError as e:
        sys.exit(f"Cannot bind to port {UDP_PORT}: {e}\n"
                 "Is the port already in use?")

    stop = threading.Event()
    rx   = threading.Thread(target=_receiver_loop, args=(sock, stop), daemon=True)
    rx.start()

    start = time.monotonic()
    while True:
        elapsed = int(time.monotonic() - start)
        _render(elapsed)
        if elapsed >= RUN_SECONDS:
            break
        time.sleep(1.0)

    stop.set()
    rx.join(timeout=2)
    sock.close()

    _print_summary()


if __name__ == "__main__":
    main()
