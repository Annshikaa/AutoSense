#include "SensorBase.h"
#include <algorithm>
#include <chrono>

SensorBase::SensorBase(std::string name, double minVal, double maxVal, double noiseStddev)
    : name_(std::move(name))
    , minVal_(minVal)
    , maxVal_(maxVal)
    , noiseDist_(0.0, noiseStddev)
{
    // Seed with a mix of high-res clock bits for each instance
    auto seed = static_cast<uint32_t>(
        std::chrono::high_resolution_clock::now().time_since_epoch().count()
    );
    rng_.seed(static_cast<uint32_t>(seed ^ std::hash<std::string>{}(name_)));
}

double SensorBase::addNoise(double value, double stddev) {
    std::normal_distribution<double> d(0.0, stddev);
    return value + d(rng_);
}

double SensorBase::clamp(double value, double lo, double hi) {
    return std::max(lo, std::min(hi, value));
}
