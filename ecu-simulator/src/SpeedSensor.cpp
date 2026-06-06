#include "Sensors.h"

SpeedSensor::SpeedSensor(const RPMSensor* rpm, double speedMax, double rpmFactor)
    : SensorBase("Speed", 0.0, speedMax, 0.3)
    , rpmSensor_(rpm)
    , speedMax_(speedMax)
    , rpmFactor_(rpmFactor)
{}

double SpeedSensor::readValue() {
    if (state_ == SensorState::FAULT) {
        // Mismatch fault: speed reads 0 regardless of RPM
        currentValue_ = addNoise(0.0, 0.1);
        return currentValue_;
    }
    double derived = clamp(rpmSensor_->lastValue() * rpmFactor_, 0.0, speedMax_);
    currentValue_  = addNoise(derived, 0.3);
    return currentValue_;
}

void SpeedSensor::injectFault() {
    state_ = SensorState::FAULT;
}

void SpeedSensor::clearFault() {
    state_ = SensorState::NORMAL;
}
