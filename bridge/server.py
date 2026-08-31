#!/usr/bin/env python3
"""Read-only SocketCAN-to-WebSocket bridge for CANdash.

The bridge exposes received CAN frames. It deliberately implements no transmit
endpoint and never calls Bus.send(). Configure the Linux CAN interface itself
in listen-only mode before starting this process.
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import json
import signal
import time
from typing import Any

from aiohttp import WSMsgType, web


class CanBridge:
    def __init__(self, interface: str) -> None:
        self.interface = interface
        self.clients: set[web.WebSocketResponse] = set()
        self.frames = 0
        self.started_at = time.time()
        self.bus: Any | None = None
        self.reader_task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        try:
            import can
        except ImportError as exc:
            raise RuntimeError("python-can is required: pip install -r bridge/requirements.txt") from exc
        self.bus = can.Bus(interface="socketcan", channel=self.interface, receive_own_messages=False)
        self.reader_task = asyncio.create_task(self._read_loop())

    async def stop(self) -> None:
        if self.reader_task:
            self.reader_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self.reader_task
        if self.bus is not None:
            await asyncio.to_thread(self.bus.shutdown)

    async def _read_loop(self) -> None:
        assert self.bus is not None
        while True:
            message = await asyncio.to_thread(self.bus.recv, 0.5)
            if message is None or message.is_error_frame or message.is_remote_frame:
                continue
            self.frames += 1
            event = json.dumps({
                "type": "frame",
                "id": int(message.arbitration_id),
                "data": list(message.data),
                "timestamp_ms": float(message.timestamp) * 1000,
                "direction": "rx",
                "channel": self.interface,
                "extended": bool(message.is_extended_id),
            }, separators=(",", ":"))
            closed: list[web.WebSocketResponse] = []
            for client in tuple(self.clients):
                try:
                    await client.send_str(event)
                except (ConnectionError, RuntimeError):
                    closed.append(client)
            for client in closed:
                self.clients.discard(client)

    async def websocket(self, request: web.Request) -> web.WebSocketResponse:
        socket = web.WebSocketResponse(heartbeat=20, max_msg_size=4096)
        await socket.prepare(request)
        self.clients.add(socket)
        await socket.send_json({"type": "status", "mode": "listen-only", "interface": self.interface})
        try:
            async for message in socket:
                # No CAN transmit command is accepted. Text input is limited to
                # application-level ping so the transport remains receive-only.
                if message.type == WSMsgType.TEXT and message.data == "ping":
                    await socket.send_str("pong")
        finally:
            self.clients.discard(socket)
        return socket

    async def health(self, _request: web.Request) -> web.Response:
        return web.json_response({
            "ok": True,
            "mode": "listen-only",
            "interface": self.interface,
            "frames": self.frames,
            "clients": len(self.clients),
            "uptime_seconds": round(time.time() - self.started_at, 1),
        })


async def run(args: argparse.Namespace) -> None:
    bridge = CanBridge(args.interface)
    await bridge.start()
    app = web.Application()
    app.add_routes([web.get("/ws", bridge.websocket), web.get("/health", bridge.health)])
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, args.host, args.port)
    await site.start()
    print(f"CANdash bridge: ws://{args.host}:{args.port}/ws ← {args.interface} (receive-only)", flush=True)

    stopped = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        with contextlib.suppress(NotImplementedError):
            loop.add_signal_handler(sig, stopped.set)
    await stopped.wait()
    await bridge.stop()
    await runner.cleanup()


def main() -> None:
    parser = argparse.ArgumentParser(description="Read-only SocketCAN WebSocket bridge for CANdash")
    parser.add_argument("--interface", default="can0", help="SocketCAN interface (default: can0)")
    parser.add_argument("--host", default="127.0.0.1", help="Bind host (use 0.0.0.0 for LAN clients)")
    parser.add_argument("--port", type=int, default=8765, help="WebSocket/health port")
    asyncio.run(run(parser.parse_args()))


if __name__ == "__main__":
    main()
