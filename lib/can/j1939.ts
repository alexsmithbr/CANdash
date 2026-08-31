import type { CanFrame, DiagnosticFault, J1939Id, SignalDefinition } from "./types";

export function parseJ1939Id(id: number): J1939Id {
  const priority = (id >>> 26) & 0x7;
  const dataPage = (id >>> 24) & 0x1;
  const pf = (id >>> 16) & 0xff;
  const ps = (id >>> 8) & 0xff;
  const sourceAddress = id & 0xff;
  const pgn = pf < 240 ? (dataPage << 16) | (pf << 8) : (dataPage << 16) | (pf << 8) | ps;
  return { priority, pgn, sourceAddress, destinationAddress: pf < 240 ? ps : null };
}

function getBit(data: number[], bit: number) {
  return ((data[Math.floor(bit / 8)] ?? 0) >>> (bit % 8)) & 1;
}

export function extractRaw(data: number[], signal: SignalDefinition): number {
  let raw = 0;
  if (signal.byteOrder === "little") {
    for (let i = 0; i < signal.length; i += 1) raw += getBit(data, signal.startBit + i) * 2 ** i;
  } else {
    let bit = signal.startBit;
    for (let i = 0; i < signal.length; i += 1) {
      raw = raw * 2 + getBit(data, bit);
      bit = bit % 8 === 0 ? bit + 15 : bit - 1;
    }
  }
  if (signal.signed && raw >= 2 ** (signal.length - 1)) raw -= 2 ** signal.length;
  return raw;
}

export function setRaw(data: number[], signal: SignalDefinition, physical: number) {
  let raw = Math.round((physical - signal.offset) / signal.scale);
  if (signal.signed && raw < 0) raw += 2 ** signal.length;
  raw = Math.max(0, Math.min(2 ** signal.length - 1, raw));
  if (signal.byteOrder === "little") {
    for (let i = 0; i < signal.length; i += 1) {
      const bit = signal.startBit + i;
      const byte = Math.floor(bit / 8);
      const mask = 1 << (bit % 8);
      data[byte] = raw & 2 ** i ? (data[byte] ?? 0) | mask : (data[byte] ?? 0) & ~mask;
    }
  } else {
    let bit = signal.startBit;
    for (let i = 0; i < signal.length; i += 1) {
      const shift = signal.length - i - 1;
      const byte = Math.floor(bit / 8);
      const mask = 1 << (bit % 8);
      data[byte] = raw & 2 ** shift ? (data[byte] ?? 0) | mask : (data[byte] ?? 0) & ~mask;
      bit = bit % 8 === 0 ? bit + 15 : bit - 1;
    }
  }
}

export function decodeSignal(data: number[], signal: SignalDefinition): number | null {
  if (signal.length < 1 || signal.length > 32) return null;
  const raw = extractRaw(data, signal);
  if ((signal.invalidPolicy ?? "j1939") === "j1939") {
    const unsignedRaw = raw < 0 ? raw + 2 ** signal.length : raw;
    const top = 2 ** signal.length - 1;
    if (signal.length === 2 ? unsignedRaw >= 2 : unsignedRaw >= top - 1) return null;
  }
  const value = raw * signal.scale + signal.offset;
  if (!Number.isFinite(value)) return null;
  if (signal.minimum != null && value < signal.minimum) return null;
  if (signal.maximum != null && value > signal.maximum) return null;
  return value;
}

export function formatHex(value: number, width: number) {
  return `0x${value.toString(16).toUpperCase().padStart(width, "0")}`;
}

export function parseCandump(text: string): CanFrame[] {
  const frames: CanFrame[] = [];
  const pattern = /^\((\d+(?:\.\d+)?)\)\s+(\S+)\s+([0-9A-Fa-f]{3,8})#([0-9A-Fa-f]*)/;
  for (const line of text.split(/\r?\n/)) {
    const match = line.trim().match(pattern);
    if (!match) continue;
    const payload = match[4];
    const data = payload.match(/../g)?.map((byte) => Number.parseInt(byte, 16)) ?? [];
    frames.push({ timestamp: Number(match[1]) * 1000, channel: match[2], id: Number.parseInt(match[3], 16), data, direction: "rx" });
  }
  if (frames.length) {
    const start = frames[0].timestamp;
    for (const frame of frames) frame.timestamp -= start;
  }
  return frames;
}

export function decodeDm1(data: number[], sourceAddress: number, now: number): DiagnosticFault[] {
  const faults: DiagnosticFault[] = [];
  for (let i = 2; i + 3 < data.length; i += 4) {
    const a = data[i], b = data[i + 1], c = data[i + 2], d = data[i + 3];
    if ([a, b, c, d].every((v) => v === 0xff)) continue;
    const spn = a | (b << 8) | ((c & 0xe0) << 11);
    const fmi = c & 0x1f;
    const occurrenceCount = d & 0x7f;
    const conversionMethod = (d >>> 7) & 1;
    faults.push({ key: `${sourceAddress}-${spn}-${fmi}`, sourceAddress, spn, fmi, occurrenceCount, conversionMethod, active: true, lastSeen: now });
  }
  return faults;
}

type TpSession = { pgn: number; size: number; packets: number; data: number[]; nextSequence: number };

export class TransportProtocolAssembler {
  private sessions = new Map<number, TpSession>();

  ingest(frame: CanFrame): { pgn: number; sourceAddress: number; data: number[] } | null {
    const info = parseJ1939Id(frame.id);
    if (info.pgn === 0xec00 && frame.data[0] === 0x20 && frame.data.length >= 8) {
      this.sessions.set(info.sourceAddress, {
        size: frame.data[1] | (frame.data[2] << 8), packets: frame.data[3],
        pgn: frame.data[5] | (frame.data[6] << 8) | (frame.data[7] << 16), data: [], nextSequence: 1,
      });
      return null;
    }
    if (info.pgn !== 0xeb00) return null;
    const session = this.sessions.get(info.sourceAddress);
    if (!session || frame.data[0] !== session.nextSequence) return null;
    session.data.push(...frame.data.slice(1));
    session.nextSequence += 1;
    if (session.nextSequence <= session.packets) return null;
    this.sessions.delete(info.sourceAddress);
    return { pgn: session.pgn, sourceAddress: info.sourceAddress, data: session.data.slice(0, session.size) };
  }
}
