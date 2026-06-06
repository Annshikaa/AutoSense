#include "Vehicle.h"
#include <thread>
#include <chrono>
#include <iostream>
#include <atomic>
#include <csignal>
#include <vector>
#include <string>

#ifdef _WIN32
  #include <windows.h>
#endif

static std::atomic<bool> g_running{true};

static void handleSignal(int) {
    g_running = false;
}

static void enableAnsiColors() {
#ifdef _WIN32
    HANDLE hOut = GetStdHandle(STD_OUTPUT_HANDLE);
    if (hOut == INVALID_HANDLE_VALUE) return;
    DWORD dwMode = 0;
    GetConsoleMode(hOut, &dwMode);
    SetConsoleMode(hOut, dwMode | ENABLE_VIRTUAL_TERMINAL_PROCESSING);
#endif
}

static void vehicleLoop(const std::string& vehicleId, VehicleType type) {
    Vehicle v(vehicleId, type, "127.0.0.1", 5000);
    while (g_running) {
        v.update();
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }
}

int main() {
    enableAnsiColors();

    std::signal(SIGINT,  handleSignal);
    std::signal(SIGTERM, handleSignal);

    std::cout << "\033[1;36m"
              << "\xE2\x95\x94\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x97\n"
              << "\xE2\x95\x91  AutoSense ECU Simulator  v2.0                   \xE2\x95\x91\n"
              << "\xE2\x95\x91  10 vehicles \xC2\xB7 4 types \xC2\xB7 100 ms update rate         \xE2\x95\x91\n"
              << "\xE2\x95\x91  UDP \xE2\x86\x92 127.0.0.1:5000   |   Ctrl+C to stop         \xE2\x95\x91\n"
              << "\xE2\x95\x9A\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x90\xE2\x95\x9D\n"
              << "\033[0m\n";

    using VE = std::pair<std::string, VehicleType>;
    const std::vector<VE> vehicles = {
        {"car_01",       VehicleType::CAR},
        {"car_02",       VehicleType::CAR},
        {"car_03",       VehicleType::CAR},
        {"truck_01",     VehicleType::TRUCK},
        {"truck_02",     VehicleType::TRUCK},
        {"truck_03",     VehicleType::TRUCK},
        {"bus_01",       VehicleType::BUS},
        {"bus_02",       VehicleType::BUS},
        {"bus_03",       VehicleType::BUS},
        {"ambulance_01", VehicleType::AMBULANCE},
    };

    std::vector<std::thread> threads;
    threads.reserve(vehicles.size());
    for (const auto& [id, type] : vehicles) {
        threads.emplace_back(vehicleLoop, id, type);
        // Stagger start times so fault events don't overlap at startup
        std::this_thread::sleep_for(std::chrono::milliseconds(50));
    }

    for (auto& t : threads) {
        t.join();
    }

    std::cout << "\n\033[1;33mSimulator stopped.\033[0m\n";
    return 0;
}
