#pragma once
#include "Sensors.h"
#include "ExtraSensors.h"
#include "FaultInjector.h"
#include "VehicleConfig.h"
#include "UDPSender.h"
#include <string>
#include <memory>

struct SensorSnapshot {
    double      rpm;
    double      speed;
    double      temperature;
    double      throttle;
    double      battery;
    double      extraValue;     // fuel_level / load_weight / door_status / siren_active
    bool        faultActive;
    std::string faultType;
};

class Vehicle {
public:
    Vehicle(std::string vehicleId,
            VehicleType type,
            const std::string& host = "127.0.0.1",
            uint16_t port = 5000);

    // One simulation step: read sensors, build JSON, send UDP, print console
    void update();

    const std::string&  getId()        const { return vehicleId_; }
    VehicleType         getType()      const { return vehicleType_; }
    SensorSnapshot      lastSnapshot() const { return snapshot_; }

private:
    std::string buildJson(double timestampMs) const;
    void        printConsole()                const;

    std::string   vehicleId_;
    VehicleType   vehicleType_;
    VehicleConfig config_;         // declared before sensors — init order matters

    RPMSensor      rpmSensor_;
    SpeedSensor    speedSensor_;
    TempSensor     tempSensor_;
    ThrottleSensor throttleSensor_;
    BatterySensor  batterySensor_;

    std::unique_ptr<SensorBase>    extraSensor_;
    std::unique_ptr<FaultInjector> faultInjector_;
    std::unique_ptr<UDPSender>     udpSender_;

    SensorSnapshot snapshot_{};
};
