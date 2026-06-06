#include "Vehicle.h"
#include "../third_party/json.hpp"
#include <chrono>
#include <iostream>
#include <iomanip>
#include <sstream>

using json = nlohmann::json;

namespace Color {
    constexpr const char* RESET   = "\033[0m";
    constexpr const char* RED     = "\033[1;31m";
    constexpr const char* GREEN   = "\033[1;32m";
    constexpr const char* BOLD    = "\033[1m";
}

static std::unique_ptr<SensorBase> makeExtraSensor(VehicleType type) {
    switch (type) {
    case VehicleType::CAR:       return std::make_unique<FuelLevelSensor>();
    case VehicleType::TRUCK:     return std::make_unique<LoadWeightSensor>();
    case VehicleType::BUS:       return std::make_unique<DoorStatusSensor>();
    case VehicleType::AMBULANCE: return std::make_unique<SirenSensor>();
    }
    return std::make_unique<FuelLevelSensor>();
}

// ── Constructor ────────────────────────────────────────────────────────────
// Member declaration order in Vehicle.h: vehicleId_, vehicleType_, config_,
// rpmSensor_, speedSensor_, tempSensor_, throttleSensor_, batterySensor_
// config_ is initialized first, so it's safe to use in sensor initializers.
Vehicle::Vehicle(std::string vehicleId, VehicleType type,
                 const std::string& host, uint16_t port)
    : vehicleId_(std::move(vehicleId))
    , vehicleType_(type)
    , config_(makeVehicleConfig(type))
    , rpmSensor_(config_.rpmMin, config_.rpmMax, config_.rpmFaultTarget, config_.rpmInitial)
    , speedSensor_(&rpmSensor_, config_.speedMax, config_.rpmToSpeedFactor)
    , tempSensor_(config_.tempMin, config_.tempMax, config_.tempFaultTarget)
    , throttleSensor_()
    , batterySensor_(config_.battMin, config_.battMax, config_.battFaultFloor)
    , extraSensor_(makeExtraSensor(type))
    , udpSender_(std::make_unique<UDPSender>(host, port))
{
    faultInjector_ = std::make_unique<FaultInjector>(
        std::vector<SensorBase*>{
            &rpmSensor_, &speedSensor_, &tempSensor_,
            &throttleSensor_, &batterySensor_
        },
        config_.faultWeights,
        config_.injectMinMs, config_.injectMaxMs,
        config_.recoverMinMs, config_.recoverMaxMs
    );
}

// ── update ─────────────────────────────────────────────────────────────────
void Vehicle::update() {
    faultInjector_->tick();

    snapshot_.rpm         = rpmSensor_.readValue();
    snapshot_.speed       = speedSensor_.readValue();
    snapshot_.temperature = tempSensor_.readValue();
    snapshot_.throttle    = throttleSensor_.readValue();
    snapshot_.battery     = batterySensor_.readValue();
    snapshot_.extraValue  = extraSensor_->readValue();
    snapshot_.faultActive = faultInjector_->hasFault();
    snapshot_.faultType   = faultInjector_->faultType();

    auto now = std::chrono::system_clock::now();
    double tsMs = static_cast<double>(
        std::chrono::duration_cast<std::chrono::milliseconds>(
            now.time_since_epoch()).count()
    );

    udpSender_->send(buildJson(tsMs));
    printConsole();
}

// ── buildJson ──────────────────────────────────────────────────────────────
std::string Vehicle::buildJson(double timestampMs) const {
    json j;
    j["vehicle_id"]   = vehicleId_;
    j["vehicle_type"] = config_.typeStr;
    j["timestamp"]    = timestampMs;
    j["sensors"] = {
        {"rpm",                           std::round(snapshot_.rpm         * 10)  / 10},
        {"speed",                         std::round(snapshot_.speed       * 10)  / 10},
        {"temperature",                   std::round(snapshot_.temperature * 10)  / 10},
        {"throttle",                      std::round(snapshot_.throttle    * 10)  / 10},
        {"battery",                       std::round(snapshot_.battery     * 100) / 100},
        {config_.extraSensorKey,          std::round(snapshot_.extraValue  * 100) / 100}
    };
    j["fault_active"] = snapshot_.faultActive;
    j["fault_type"]   = snapshot_.faultType;
    return j.dump();
}

// ── printConsole ───────────────────────────────────────────────────────────
void Vehicle::printConsole() const {
    std::ostringstream oss;
    oss << std::fixed << std::setprecision(1);

    oss << config_.colorCode << "[" << vehicleId_ << "]" << Color::RESET << "  ";

    bool rpmFault = (snapshot_.faultType == "RPM_FAULT");
    oss << (rpmFault ? Color::RED : Color::GREEN)
        << "RPM:" << std::setw(7) << snapshot_.rpm << Color::RESET << "  ";

    bool spdFault = (snapshot_.faultType == "Speed_FAULT");
    oss << (spdFault ? Color::RED : Color::GREEN)
        << "Spd:" << std::setw(6) << snapshot_.speed << Color::RESET << "  ";

    bool tmpFault = (snapshot_.faultType == "Temperature_FAULT");
    oss << (tmpFault ? Color::RED : Color::GREEN)
        << "Tmp:" << std::setw(6) << snapshot_.temperature << "\xC2\xB0""C" << Color::RESET << "  ";

    bool batFault = (snapshot_.faultType == "Battery_FAULT");
    oss << std::setprecision(2);
    oss << (batFault ? Color::RED : Color::GREEN)
        << "Bat:" << std::setw(5) << snapshot_.battery << "V" << Color::RESET;

    oss << std::setprecision(1);
    oss << "  " << config_.extraSensorKey << ":" << std::setw(6) << snapshot_.extraValue;

    if (snapshot_.faultActive) {
        oss << "  " << Color::RED << Color::BOLD
            << "!! FAULT: " << snapshot_.faultType << " !!"
            << Color::RESET;
    }

    std::cout << oss.str() << "\n";
}
