#include "VehicleConfig.h"

VehicleConfig makeVehicleConfig(VehicleType type) {
    VehicleConfig c;
    c.type = type;

    switch (type) {
    case VehicleType::CAR:
        c.typeStr          = "car";
        c.colorCode        = "\033[1;36m";    // cyan
        c.rpmMin           = 800.0;
        c.rpmMax           = 4000.0;
        c.rpmFaultTarget   = 7000.0;
        c.rpmInitial       = 1500.0;
        c.speedMax         = 120.0;
        c.rpmToSpeedFactor = 0.028;
        c.tempMin          = 85.0;
        c.tempMax          = 95.0;
        c.tempFaultTarget  = 130.0;
        c.battMin          = 12.0;
        c.battMax          = 14.5;
        c.battFaultFloor   = 10.5;
        c.injectMinMs      = 30'000;
        c.injectMaxMs      = 60'000;
        c.recoverMinMs     = 5'000;
        c.recoverMaxMs     = 15'000;
        c.faultWeights     = {1.0, 1.0, 1.0, 1.0, 1.0};
        c.extraSensorKey   = "fuel_level";
        break;

    case VehicleType::TRUCK:
        c.typeStr          = "truck";
        c.colorCode        = "\033[1;33m";    // yellow
        c.rpmMin           = 600.0;
        c.rpmMax           = 2500.0;
        c.rpmFaultTarget   = 4500.0;
        c.rpmInitial       = 1000.0;
        c.speedMax         = 90.0;
        c.rpmToSpeedFactor = 0.036;
        c.tempMin          = 90.0;
        c.tempMax          = 105.0;
        c.tempFaultTarget  = 135.0;
        c.battMin          = 24.0;
        c.battMax          = 28.0;
        c.battFaultFloor   = 21.0;
        c.injectMinMs      = 20'000;
        c.injectMaxMs      = 45'000;
        c.recoverMinMs     = 5'000;
        c.recoverMaxMs     = 20'000;
        c.faultWeights     = {1.0, 1.0, 3.0, 1.0, 1.0};   // temp faults 3x more likely
        c.extraSensorKey   = "load_weight";
        break;

    case VehicleType::BUS:
        c.typeStr          = "bus";
        c.colorCode        = "\033[1;32m";    // green
        c.rpmMin           = 700.0;
        c.rpmMax           = 3000.0;
        c.rpmFaultTarget   = 5000.0;
        c.rpmInitial       = 1200.0;
        c.speedMax         = 80.0;
        c.rpmToSpeedFactor = 0.027;
        c.tempMin          = 88.0;
        c.tempMax          = 100.0;
        c.tempFaultTarget  = 125.0;
        c.battMin          = 24.0;
        c.battMax          = 28.0;
        c.battFaultFloor   = 20.0;
        c.injectMinMs      = 25'000;
        c.injectMaxMs      = 50'000;
        c.recoverMinMs     = 5'000;
        c.recoverMaxMs     = 15'000;
        c.faultWeights     = {1.0, 1.0, 1.0, 1.0, 3.0};   // battery faults 3x more likely
        c.extraSensorKey   = "door_status";
        break;

    case VehicleType::AMBULANCE:
        c.typeStr          = "ambulance";
        c.colorCode        = "\033[1;35m";    // magenta
        c.rpmMin           = 800.0;
        c.rpmMax           = 5000.0;
        c.rpmFaultTarget   = 7500.0;
        c.rpmInitial       = 1500.0;
        c.speedMax         = 140.0;
        c.rpmToSpeedFactor = 0.028;
        c.tempMin          = 85.0;
        c.tempMax          = 95.0;
        c.tempFaultTarget  = 130.0;
        c.battMin          = 12.0;
        c.battMax          = 14.5;
        c.battFaultFloor   = 10.5;
        c.injectMinMs      = 60'000;    // ambulances fault rarely
        c.injectMaxMs      = 120'000;
        c.recoverMinMs     = 3'000;
        c.recoverMaxMs     = 8'000;     // recover quickly when they do
        c.faultWeights     = {1.0, 1.0, 1.0, 1.0, 1.0};
        c.extraSensorKey   = "siren_active";
        break;
    }

    return c;
}
