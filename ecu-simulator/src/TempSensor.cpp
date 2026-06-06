#include "Sensors.h"
#include <algorithm>

TempSensor::TempSensor(double normalMin, double normalMax, double faultTarget)
    : SensorBase("Temperature", normalMin, normalMax, 0.3)
    , normalMin_(normalMin)
    , normalMax_(normalMax)
    , currentTemp_((normalMin + normalMax) / 2.0)
    , faultTarget_(faultTarget)
{}

double TempSensor::readValue() {
    if (state_ == SensorState::FAULT) {
        if (currentTemp_ < faultTarget_) {
            currentTemp_ = std::min(currentTemp_ + 1.2, faultTarget_);
        }
    } else {
        std::uniform_real_distribution<double> drift(-0.3, 0.3);
        currentTemp_ = clamp(currentTemp_ + drift(rng_), normalMin_, normalMax_);
    }
    currentValue_ = addNoise(currentTemp_, 0.3);
    return currentValue_;
}

void TempSensor::injectFault() {
    state_ = SensorState::FAULT;
}

void TempSensor::clearFault() {
    state_       = SensorState::NORMAL;
    currentTemp_ = (normalMin_ + normalMax_) / 2.0;
}
