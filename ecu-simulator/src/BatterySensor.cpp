#include "Sensors.h"

BatterySensor::BatterySensor(double normalMin, double normalMax, double faultFloor)
    : SensorBase("Battery", normalMin, normalMax, 0.05)
    , normalMin_(normalMin)
    , normalMax_(normalMax)
    , faultFloor_(faultFloor)
{
    currentValue_ = (normalMin + normalMax) / 2.0;
}

double BatterySensor::readValue() {
    if (state_ == SensorState::FAULT) {
        currentValue_ = clamp(currentValue_ - 0.05, faultFloor_, normalMax_);
        return addNoise(currentValue_, 0.02);
    }
    std::uniform_real_distribution<double> drift(-0.02, 0.02);
    currentValue_ = clamp(currentValue_ + drift(rng_), normalMin_, normalMax_);
    return addNoise(currentValue_, 0.05);
}

void BatterySensor::injectFault() {
    state_ = SensorState::FAULT;
}

void BatterySensor::clearFault() {
    state_        = SensorState::NORMAL;
    currentValue_ = (normalMin_ + normalMax_) / 2.0;
}
