#include "Sensors.h"

ThrottleSensor::ThrottleSensor()
    : SensorBase("Throttle", 0.0, 100.0, 0.5)
{
    currentThrottle_ = 20.0;
}

double ThrottleSensor::readValue() {
    if (state_ == SensorState::FAULT) {
        // Stuck wide-open
        currentValue_ = addNoise(100.0, 0.1);
        return currentValue_;
    }
    // Simulate driver inputs: slow random walk
    std::uniform_real_distribution<double> drift(-2.0, 2.0);
    currentThrottle_ = clamp(currentThrottle_ + drift(rng_), 0.0, 100.0);
    currentValue_    = addNoise(currentThrottle_, 0.5);
    return currentValue_;
}

void ThrottleSensor::injectFault() {
    state_           = SensorState::FAULT;
    currentThrottle_ = 100.0;
}

void ThrottleSensor::clearFault() {
    state_           = SensorState::NORMAL;
    currentThrottle_ = 20.0;
}
