#pragma once
#include <string>
#include <vector>

enum class VehicleType { CAR, TRUCK, BUS, AMBULANCE };

struct VehicleConfig {
    VehicleType type;
    std::string typeStr;        // "car", "truck", "bus", "ambulance"
    std::string colorCode;      // ANSI color for console output

    // RPM sensor parameters
    double rpmMin, rpmMax;
    double rpmFaultTarget;
    double rpmInitial;

    // Speed sensor parameters
    double speedMax;
    double rpmToSpeedFactor;

    // Temperature sensor parameters
    double tempMin, tempMax;
    double tempFaultTarget;

    // Battery sensor parameters
    double battMin, battMax;
    double battFaultFloor;

    // Fault injection timing (milliseconds)
    int injectMinMs, injectMaxMs;
    int recoverMinMs, recoverMaxMs;

    // Per-sensor fault weights (index: 0=rpm, 1=speed, 2=temp, 3=throttle, 4=battery)
    std::vector<double> faultWeights;

    // Extra type-specific sensor key in JSON
    std::string extraSensorKey;
};

VehicleConfig makeVehicleConfig(VehicleType type);
