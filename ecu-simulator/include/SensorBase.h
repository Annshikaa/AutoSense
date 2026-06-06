#pragma once
#include <string>
#include <random>

enum class SensorState { NORMAL, FAULT };

class SensorBase {
public:
    SensorBase(std::string name, double minVal, double maxVal, double noiseStddev = 0.5);
    virtual ~SensorBase() = default;

    virtual double readValue() = 0;
    virtual void   injectFault() = 0;
    virtual void   clearFault()  = 0;

    bool              isFaulty()  const { return state_ == SensorState::FAULT; }
    SensorState       getState()  const { return state_; }
    const std::string& getName() const { return name_; }
    double            lastValue() const { return currentValue_; }

protected:
    double addNoise(double value, double stddev);
    static double clamp(double value, double lo, double hi);

    std::string name_;
    double      minVal_, maxVal_;
    SensorState state_        = SensorState::NORMAL;
    double      currentValue_ = 0.0;

    std::mt19937                     rng_;
    std::normal_distribution<double> noiseDist_;
};
