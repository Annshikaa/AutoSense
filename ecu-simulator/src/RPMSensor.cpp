#include "Sensors.h"
#include <cmath>

RPMSensor::RPMSensor(double normalMin, double normalMax, double faultTarget, double initial)
    : SensorBase("RPM", normalMin, normalMax, 15.0)
    , normalMin_(normalMin)
    , normalMax_(normalMax)
    , faultTarget_(faultTarget)
    , targetRPM_(initial)
    , currentRPM_(initial)
{}

double RPMSensor::readValue() {
    if (state_ == SensorState::FAULT) {
        currentRPM_ = clamp(currentRPM_ + 180.0, normalMin_, faultTarget_);
    } else {
        std::uniform_real_distribution<double> drift(-50.0, 50.0);
        targetRPM_  = clamp(targetRPM_ + drift(rng_), normalMin_, normalMax_);
        double delta = (targetRPM_ - currentRPM_) * 0.1;
        currentRPM_ = clamp(currentRPM_ + delta, normalMin_, normalMax_);
    }
    currentValue_ = addNoise(currentRPM_, 15.0);
    return currentValue_;
}

void RPMSensor::injectFault() {
    state_      = SensorState::FAULT;
    currentRPM_ = normalMax_ * 1.05;   // start just above normal max
}

void RPMSensor::clearFault() {
    state_      = SensorState::NORMAL;
    currentRPM_ = (normalMin_ + normalMax_) / 2.0;
    targetRPM_  = currentRPM_;
}
