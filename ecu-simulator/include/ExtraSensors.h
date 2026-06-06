#pragma once
#include "SensorBase.h"

// Fuel level % (0–100), slowly drains — used by Car
class FuelLevelSensor : public SensorBase {
public:
    FuelLevelSensor();
    double readValue()   override;
    void   injectFault() override;
    void   clearFault()  override;

private:
    double currentFuel_;
};

// Load weight % (0–100), random walk representing cargo — used by Truck
class LoadWeightSensor : public SensorBase {
public:
    LoadWeightSensor();
    double readValue()   override;
    void   injectFault() override;
    void   clearFault()  override;
};

// Door status: 0=closed, 1=open, toggles at simulated stops — used by Bus
class DoorStatusSensor : public SensorBase {
public:
    DoorStatusSensor();
    double readValue()   override;
    void   injectFault() override;
    void   clearFault()  override;

private:
    bool doorOpen_    = false;
    int  toggleTimer_ = 0;
};

// Siren: 0=off, 1=on, randomly activated — used by Ambulance
class SirenSensor : public SensorBase {
public:
    SirenSensor();
    double readValue()   override;
    void   injectFault() override;
    void   clearFault()  override;

private:
    bool sirenOn_     = false;
    int  toggleTimer_ = 0;
};
