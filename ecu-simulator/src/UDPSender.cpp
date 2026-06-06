#include "UDPSender.h"
#include <cstring>
#include <stdexcept>
#include <iostream>

#ifdef _WIN32
  #include <winsock2.h>
  #include <ws2tcpip.h>
  #pragma comment(lib, "ws2_32.lib")
  #define CLOSE_SOCKET(s) closesocket(s)
  #define INVALID_SOCK    INVALID_SOCKET
#else
  #include <sys/socket.h>
  #include <arpa/inet.h>
  #include <unistd.h>
  #define CLOSE_SOCKET(s) ::close(s)
  #define INVALID_SOCK    (-1)
#endif

UDPSender::UDPSender(const std::string& host, uint16_t port)
    : host_(host), port_(port)
{
#ifdef _WIN32
    WSADATA wsaData;
    if (WSAStartup(MAKEWORD(2, 2), &wsaData) != 0) {
        std::cerr << "[UDPSender] WSAStartup failed\n";
        return;
    }
    sock_ = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    if (sock_ == INVALID_SOCKET) {
        std::cerr << "[UDPSender] socket() failed: " << WSAGetLastError() << "\n";
        return;
    }
#else
    sock_ = socket(AF_INET, SOCK_DGRAM, 0);
    if (sock_ == INVALID_SOCK) {
        std::cerr << "[UDPSender] socket() failed\n";
        return;
    }
#endif
    ready_ = true;
}

UDPSender::~UDPSender() {
    if (ready_) {
        CLOSE_SOCKET(sock_);
#ifdef _WIN32
        WSACleanup();
#endif
    }
}

bool UDPSender::send(const std::string& payload) {
    if (!ready_) return false;

    sockaddr_in dest{};
    dest.sin_family = AF_INET;
    dest.sin_port   = htons(port_);
    inet_pton(AF_INET, host_.c_str(), &dest.sin_addr);

    int sent = sendto(
        sock_,
        payload.c_str(),
        static_cast<int>(payload.size()),
        0,
        reinterpret_cast<sockaddr*>(&dest),
        sizeof(dest)
    );
    return sent > 0;
}
