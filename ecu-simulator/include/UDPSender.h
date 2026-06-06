#pragma once
#include <string>
#include <cstdint>

#ifdef _WIN32
  #include <winsock2.h>
  using SocketFd = SOCKET;
#else
  using SocketFd = int;
#endif

class UDPSender {
public:
    UDPSender(const std::string& host, uint16_t port);
    ~UDPSender();

    // Returns true on success
    bool send(const std::string& payload);

private:
    SocketFd    sock_;
    std::string host_;
    uint16_t    port_;
    bool        ready_ = false;
};
