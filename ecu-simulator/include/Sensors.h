#pragma once
#include "SensorBase.h"

// ── RPM ────────────────────────────────────────────────────────────────────
class RPMSensor : public SensorBase {
public:
    RPMSensor(double normalMin   = 800.0,
              double normalMax   = 4000.0,
              double faultTarget = 7000.0,
              double initial     = 1500.0);
    double readValue()   override;
    void   injectFault() override;
    void   clearFault()  override;

private:
    double normalMin_;
    double normalMax_;
    double faultTarget_;
    double targetRPM_;
    double currentRPM_;
};

// ── Speed ──────────────────────────────────────────────────────────────────
class SpeedSensor : public SensorBase {
public:
    SpeedSensor(const RPMSensor* rpm,
                double speedMax   = 120.0,
                double rpmFactor  = 0.028);
    double readValue()   override;
    void   injectFault() override;
    void   clearFault()  override;

private:
    const RPMSensor* rpmSensor_;
    double           speedMax_;
    double           rpmFactor_;
};

// ── Temperature ────────────────────────────────────────────────────────────
class TempSensor : public SensorBase {
public:
    TempSensor(double normalMin   = 85.0,
               double normalMax   = 95.0,
               double faultTarget = 135.0);
    double readValue()   override;
    void   injectFault() override;
    void   clearFault()  override;

private:
    double normalMin_;
    double normalMax_;
    double currentTemp_;
    double faultTarget_;
};

// ── Throttle ───────────────────────────────────────────────────────────────
class ThrottleSensor : public SensorBase {
public:
    ThrottleSensor();
    double readValue()   override;
    void   injectFault() override;
    void   clearFault()  override;

private:
    double currentThrottle_ = 20.0;
};

// ── Battery ────────────────────────────────────────────────────────────────
class BatterySensor : public SensorBase {
public:
    BatterySensor(double normalMin  = 12.0,
                  double normalMax  = 14.5,
                  double faultFloor = 10.5);
    double readValue()   override;
    void   injectFault() override;
    void   clearFault()  override;

private:
    double normalMin_;
    double normalMax_;
    double faultFloor_;
};
