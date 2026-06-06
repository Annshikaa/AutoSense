#pragma once
#include <vector>
#include <string>
#include <random>
#include <chrono>
#include "SensorBase.h"

class FaultInjector {
public:
    FaultInjector(std::vector<SensorBase*> sensors,
                  std::vector<double>      weights      = {},
                  int injectMinMs  = 30'000,
                  int injectMaxMs  = 60'000,
                  int recoverMinMs = 5'000,
                  int recoverMaxMs = 15'000);

    // Call once per update cycle; returns name of newly-injected fault or ""
    std::string tick();

    bool        hasFault()  const { return activeSensor_ != nullptr; }
    std::string faultType() const { return activeFaultType_; }

private:
    void injectRandom();
    void clearActive();

    std::vector<SensorBase*>           sensors_;
    SensorBase*                        activeSensor_    = nullptr;
    std::string                        activeFaultType_;

    std::mt19937                       rng_;
    std::uniform_int_distribution<int> injectIntervalDist_;
    std::uniform_int_distribution<int> recoverIntervalDist_;
    std::discrete_distribution<int>    sensorPickDist_;

    using Clock     = std::chrono::steady_clock;
    using TimePoint = Clock::time_point;

    TimePoint nextInjectAt_;
    TimePoint recoverAt_;
};
