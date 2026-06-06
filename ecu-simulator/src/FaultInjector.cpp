#include "FaultInjector.h"
#include <chrono>

using ms = std::chrono::milliseconds;

FaultInjector::FaultInjector(std::vector<SensorBase*> sensors,
                             std::vector<double>      weights,
                             int injectMinMs,
                             int injectMaxMs,
                             int recoverMinMs,
                             int recoverMaxMs)
    : sensors_(std::move(sensors))
    , injectIntervalDist_(injectMinMs, injectMaxMs)
    , recoverIntervalDist_(recoverMinMs, recoverMaxMs)
{
    auto seed = static_cast<uint32_t>(
        std::chrono::high_resolution_clock::now().time_since_epoch().count()
    );
    rng_.seed(seed);

    if (weights.empty() || weights.size() != sensors_.size()) {
        weights.assign(sensors_.size(), 1.0);
    }
    sensorPickDist_ = std::discrete_distribution<int>(weights.begin(), weights.end());

    nextInjectAt_ = Clock::now() + ms(injectIntervalDist_(rng_));
}

std::string FaultInjector::tick() {
    auto now = Clock::now();

    if (activeSensor_ != nullptr) {
        if (now >= recoverAt_) {
            clearActive();
        }
        return "";
    }

    if (now >= nextInjectAt_) {
        injectRandom();
        return activeFaultType_;
    }
    return "";
}

void FaultInjector::injectRandom() {
    int idx = sensorPickDist_(rng_);
    activeSensor_ = sensors_[static_cast<size_t>(idx)];
    activeSensor_->injectFault();
    activeFaultType_ = activeSensor_->getName() + "_FAULT";

    auto recoverIn = ms(recoverIntervalDist_(rng_));
    recoverAt_     = Clock::now() + recoverIn;
    nextInjectAt_  = recoverAt_ + ms(injectIntervalDist_(rng_));
}

void FaultInjector::clearActive() {
    if (activeSensor_) {
        activeSensor_->clearFault();
        activeSensor_    = nullptr;
        activeFaultType_ = "";
    }
}
