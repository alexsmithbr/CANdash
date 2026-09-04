import { setRaw } from "./j1939";
import { DEFAULT_PROFILE } from "./profile";
import type { CanFrame, SignalSource } from "./types";

export type FrameSink = (frame: CanFrame) => void;

function canId(priority: number, pgn: number, sourceAddress: number) {
  return ((priority & 7) << 26) | ((pgn & 0x3ffff) << 8) | (sourceAddress & 0xff);
}

function encodedFrame(source: SignalSource, value: number, timestamp: number): CanFrame {
  const data = Array(8).fill(0xff) as number[];
  setRaw(data, source.signal, value);
  return { id: canId(source.pgn === 0xf004 || source.pgn === 0xfe6c ? 3 : 6, source.pgn, source.sourceAddress ?? 0xfe), data, timestamp, direction: "rx", channel: "demo" };
}

export class DemoSource {
  private timer: ReturnType<typeof setInterval> | null = null;
  private startedAt = 0;
  private distance = 239568.4;

  start(sink: FrameSink) {
    this.stop();
    this.startedAt = performance.now();
    this.timer = setInterval(() => {
      const now = performance.now();
      const t = (now - this.startedAt) / 1000;
      const speed = Math.max(0, Math.min(96, 48 + 29 * Math.sin(t / 8) + 9 * Math.sin(t / 2.7)));
      const rpm = Math.max(680, Math.min(2750, 710 + speed * 21 + 160 * Math.sin(t * 1.4)));
      this.distance += speed / 36000;
      const values = [speed, rpm, 84 + 4 * Math.sin(t / 17), 250 + rpm * 0.075, 67 - t / 1800, 27.45 + 0.18 * Math.sin(t / 5), 2.8 + rpm / 310, 101.5, this.distance];
      DEFAULT_PROFILE.gauges.forEach((gauge, index) => sink(encodedFrame(gauge.sources[0], values[index], now)));
    }, 100);
  }

  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
}

export class ReplaySource {
  private paused = false;
  private runId = 0;
  private speed = 1;

  async start(frames: CanFrame[], speed: number, loop: boolean, sink: FrameSink, onProgress: (current: number, total: number) => void, startIndex = 0) {
    const runId = ++this.runId;
    this.speed = Math.max(0.01, speed);
    let firstIndex = Math.max(0, Math.min(frames.length - 1, startIndex));
    do {
      let wallCursor = performance.now();
      let captureCursor = frames[firstIndex]?.timestamp ?? 0;
      for (let index = firstIndex; index < frames.length; index += 1) {
        if (runId !== this.runId) return;
        while (this.paused && runId === this.runId) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          wallCursor = performance.now();
        }
        while (runId === this.runId && captureCursor < frames[index].timestamp) {
          if (this.paused) break;
          const wallNow = performance.now();
          captureCursor += Math.max(0, wallNow - wallCursor) * this.speed;
          wallCursor = wallNow;
          const remaining = Math.max(0, frames[index].timestamp - captureCursor);
          if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, Math.min(20, remaining / this.speed)));
        }
        if (this.paused) { index -= 1; continue; }
        if (runId !== this.runId) return;
        sink({ ...frames[index], timestamp: performance.now() });
        if (index % 100 === 0) onProgress(index, frames.length);
      }
      onProgress(frames.length - 1, frames.length);
      firstIndex = 0;
    } while (loop && runId === this.runId);
  }

  setPaused(paused: boolean) { this.paused = paused; }
  setSpeed(speed: number) { this.speed = Math.max(0.01, speed); }
  stop() { this.runId += 1; this.paused = false; }
}

export class LiveSource {
  private socket: WebSocket | null = null;

  connect(url: string, sink: FrameSink, onStatus: (status: string) => void) {
    this.disconnect();
    onStatus("connecting");
    const socket = new WebSocket(url);
    this.socket = socket;
    socket.onopen = () => onStatus("live");
    socket.onclose = () => onStatus("disconnected");
    socket.onerror = () => onStatus("error");
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(String(event.data));
        if (message.type !== "frame") return;
        sink({ id: Number(message.id), data: message.data.map(Number), timestamp: performance.now(), direction: message.direction === "tx" ? "tx" : "rx", channel: message.channel ?? "can0" });
      } catch { onStatus("invalid data"); }
    };
  }

  disconnect() { this.socket?.close(); this.socket = null; }
}
