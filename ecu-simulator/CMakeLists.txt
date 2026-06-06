cmake_minimum_required(VERSION 3.16)
project(ecu-simulator VERSION 2.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# ── Sources ────────────────────────────────────────────────────────────────
set(SOURCES
    src/main.cpp
    src/SensorBase.cpp
    src/RPMSensor.cpp
    src/SpeedSensor.cpp
    src/TempSensor.cpp
    src/ThrottleSensor.cpp
    src/BatterySensor.cpp
    src/ExtraSensors.cpp
    src/VehicleConfig.cpp
    src/FaultInjector.cpp
    src/UDPSender.cpp
    src/Vehicle.cpp
)

add_executable(ecu-simulator ${SOURCES})

# ── Include paths ──────────────────────────────────────────────────────────
target_include_directories(ecu-simulator PRIVATE
    include
    third_party
)

# ── Compiler warnings ──────────────────────────────────────────────────────
if(MSVC)
    target_compile_options(ecu-simulator PRIVATE /W4)
else()
    target_compile_options(ecu-simulator PRIVATE -Wall -Wextra -Wpedantic)
endif()

# ── Platform-specific networking ───────────────────────────────────────────
if(WIN32)
    target_link_libraries(ecu-simulator PRIVATE ws2_32)
endif()

# ── Threading ─────────────────────────────────────────────────────────────
find_package(Threads REQUIRED)
target_link_libraries(ecu-simulator PRIVATE Threads::Threads)

# ── Build-type defaults ────────────────────────────────────────────────────
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release CACHE STRING "" FORCE)
endif()
