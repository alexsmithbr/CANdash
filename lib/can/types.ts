export type GaugeType = "speedometer" | "tachometer" | "radial" | "bar" | "numeric" | "odometer";
export type ByteOrder = "little" | "big";

export type SignalDefinition = {
  name: string;
  startBit: number;
  length: number;
  byteOrder: ByteOrder;
  signed: boolean;
  scale: number;
  offset: number;
  unit: string;
  minimum?: number;
  maximum?: number;
  decimals?: number;
  invalidPolicy?: "j1939" | "none";
};

export type SignalSource = {
  sourceAddress: number | null;
  pgn: number;
  messageName?: string;
  signal: SignalDefinition;
};

export type GaugeDefinition = {
  id: string;
  title: string;
  gaugeType: GaugeType;
  minimum: number;
  maximum?: number;
  warning?: number;
  critical?: number;
  staleAfterMs: number;
  sources: SignalSource[];
};

export type DashboardProfile = {
  schemaVersion: 1;
  id: string;
  name: string;
  description?: string;
  network: { protocol: "j1939"; bitrate: number; listenOnlyDefault: boolean };
  updateIndicator: { enabled: boolean; color: string; onMs: number; fadeMs: number };
  gauges: GaugeDefinition[];
};

export type CanFrame = {
  id: number;
  data: number[];
  timestamp: number;
  direction?: "rx" | "tx";
  channel?: string;
};

export type J1939Id = {
  priority: number;
  pgn: number;
  sourceAddress: number;
  destinationAddress: number | null;
};

export type GaugeReading = {
  value: number;
  updatedAt: number;
  sourceIndex: number;
  pulse: number;
};

export type DiscoveryEntry = {
  key: string;
  pgn: number;
  sourceAddress: number;
  destinationAddress: number | null;
  count: number;
  firstSeen: number;
  lastSeen: number;
  lastData: number[];
  rate: number;
};

export type DiagnosticFault = {
  key: string;
  sourceAddress: number;
  spn: number;
  fmi: number;
  occurrenceCount: number;
  conversionMethod: number;
  active: boolean;
  lastSeen: number;
};
