#include "ExtraSensors.h"
#include <chrono>
#include <random>

// ── FuelLevelSensor ────────────────────────────────────────────────────────

FuelLevelSensor::FuelLevelSensor()
    : SensorBase("fuel_level", 0.0, 100.0, 0.2)
{
    // Randomize starting fuel level 50–100%
    std::mt19937 init_rng(static_cast<uint32_t>(
        std::chrono::high_resolution_clock::now().time_since_epoch().count()
    ));
    std::uniform_real_distribution<double> d(50.0, 100.0);
    currentFuel_ = d(init_rng);
    currentValue_ = currentFuel_;
}

double FuelLevelSensor::readValue() {
    if (state_ == SensorState::FAULT) {
        currentFuel_ = clamp(currentFuel_ - 0.002, 2.0, 15.0);
    } else {
        // Drain 0.005% per 100 ms tick ≈ 3%/min, full tank lasts ~33 min
        currentFuel_ = clamp(currentFuel_ - 0.005, 0.0, 100.0);
        if (currentFuel_ <= 0.0) currentFuel_ = 100.0;   // auto-refuel
    }
    currentValue_ = clamp(addNoise(currentFuel_, 0.2), 0.0, 100.0);
    return currentValue_;
}

void FuelLevelSensor::injectFault() {
    state_       = SensorState::FAULT;
    currentFuel_ = 8.0;
}

void FuelLevelSensor::clearFault() {
    state_       = SensorState::NORMAL;
    currentFuel_ = 60.0;
}

// ── LoadWeightSensor ───────────────────────────────────────────────────────

LoadWeightSensor::LoadWeightSensor()
    : SensorBase("load_weight", 0.0, 100.0, 0.5)
{
    currentValue_ = 65.0;
}

double LoadWeightSensor::readValue() {
    if (state_ == SensorState::FAULT) {
        currentValue_ = clamp(currentValue_ + 0.1, 100.0, 115.0);
    } else {
        std::uniform_real_distribution<double> drift(-0.5, 0.5);
        currentValue_ = clamp(currentValue_ + drift(rng_), 40.0, 95.0);
    }
    return addNoise(currentValue_, 0.5);
}

void LoadWeightSensor::injectFault() {
    state_        = SensorState::FAULT;
    currentValue_ = 102.0;   // overload reading
}

void LoadWeightSensor::clearFault() {
    state_        = SensorState::NORMAL;
    currentValue_ = 65.0;
}

// ── DoorStatusSensor ───────────────────────────────────────────────────────

DoorStatusSensor::DoorStatusSensor()
    : SensorBase("door_status", 0.0, 1.0, 0.0)
{
    toggleTimer_ = 300;   // initial toggle in ~30 s (300 ticks × 100 ms)
}

double DoorStatusSensor::readValue() {
    if (state_ == SensorState::FAULT) {
        doorOpen_ = true;   // stuck open
    } else {
        if (--toggleTimer_ <= 0) {
            doorOpen_ = !doorOpen_;
            std::uniform_int_distribution<int> td(200, 600);
            toggleTimer_ = td(rng_);
        }
    }
    currentValue_ = doorOpen_ ? 1.0 : 0.0;
    return currentValue_;
}

void DoorStatusSensor::injectFault() {
    state_    = SensorState::FAULT;
    doorOpen_ = true;
}

void DoorStatusSensor::clearFault() {
    state_       = SensorState::NORMAL;
    doorOpen_    = false;
    toggleTimer_ = 300;
}

// ── SirenSensor ────────────────────────────────────────────────────────────

SirenSensor::SirenSensor()
    : SensorBase("siren_active", 0.0, 1.0, 0.0)
{
    toggleTimer_ = 600;   // initially off, activates after ~60 s
}

double SirenSensor::readValue() {
    if (state_ == SensorState::FAULT) {
        sirenOn_ = true;   // stuck on
    } else {
        if (--toggleTimer_ <= 0) {
            sirenOn_ = !sirenOn_;
            // On: 30–90 s before turning off; Off: 120–300 s before turning on
            std::uniform_int_distribution<int> td(
                sirenOn_ ? 300  : 1200,
                sirenOn_ ? 900  : 3000
            );
            toggleTimer_ = td(rng_);
        }
    }
    currentValue_ = sirenOn_ ? 1.0 : 0.0;
    return currentValue_;
}

void SirenSensor::injectFault() {
    state_   = SensorState::FAULT;
    sirenOn_ = true;
}

void SirenSensor::clearFault() {
    state_       = SensorState::NORMAL;
    sirenOn_     = false;
    toggleTimer_ = 600;
}
