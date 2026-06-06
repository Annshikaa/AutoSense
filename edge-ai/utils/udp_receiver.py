"""
Async UDP receiver using asyncio.DatagramProtocol.
Register handlers; each valid JSON packet is dispatched to all of them.
"""
import asyncio
import json
import logging
from typing import Callable, List

logger = logging.getLogger(__name__)

PacketHandler = Callable[[dict], None]


class _ECUProtocol(asyncio.DatagramProtocol):
    def __init__(self, handlers: List[PacketHandler]) -> None:
        self._handlers  = handlers
        self.transport  = None

    def connection_made(self, transport: asyncio.DatagramTransport) -> None:
        self.transport = transport
        addr = transport.get_extra_info("sockname")
        logger.info("UDP receiver bound to %s:%d", *addr)

    def datagram_received(self, data: bytes, addr) -> None:
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            logger.debug("Non-UTF-8 bytes from %s — skipped", addr)
            return
        try:
            packet = json.loads(text)
        except json.JSONDecodeError as exc:
            logger.debug("Invalid JSON from %s: %s — skipped", addr, exc)
            return
        if not isinstance(packet, dict):
            logger.debug("Expected JSON object from %s — skipped", addr)
            return
        for handler in self._handlers:
            try:
                handler(packet)
            except Exception:
                logger.exception("Handler %s raised an exception", handler)

    def error_received(self, exc: Exception) -> None:
        logger.warning("UDP socket error: %s", exc)

    def connection_lost(self, exc) -> None:
        logger.info("UDP connection closed (exc=%s)", exc)


class UDPReceiver:
    """
    Async UDP receiver.

    Usage
    -----
    rx = UDPReceiver(port=5000)
    rx.register(my_handler)          # add as many handlers as needed
    await rx.start()                 # binds socket, runs until rx.stop()
    """

    def __init__(self, host: str = "0.0.0.0", port: int = 5000) -> None:
        self._host      = host
        self._port      = port
        self._handlers: List[PacketHandler] = []
        self._transport = None

    def register(self, handler: PacketHandler) -> None:
        """Add a callback invoked with each valid packet dict."""
        self._handlers.append(handler)

    async def start(self) -> None:
        """Bind the socket and begin dispatching packets."""
        loop = asyncio.get_running_loop()
        self._transport, _ = await loop.create_datagram_endpoint(
            lambda: _ECUProtocol(self._handlers),
            local_addr=(self._host, self._port),
        )
        logger.info("UDPReceiver listening on %s:%d", self._host, self._port)

    def stop(self) -> None:
        """Close the socket."""
        if self._transport:
            self._transport.close()
            self._transport = None
            logger.info("UDPReceiver stopped")
