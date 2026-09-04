export type GaugeType = "speedometer" | "tachometer" | "radial" | "temperature" | "pressure" | "bar" | "numeric" | "odometer" | "history" | "histogram" | "formula";
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
  canId?: number;
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
  conversion?: UnitConversion;
  formula?: FormulaDefinition;
  smoothing?: SmoothingDefinition;
  historyWindowMs?: number;
  longAverage?: LongAverageDefinition;
  statisticsDisplay?: StatisticsDisplayDefinition;
  /** Legacy v0.5 setting. New profiles use statisticsDisplay. */
  showStatistics?: boolean;
};

export type StatisticsDisplayDefinition = {
  enabled: boolean;
  showMinimum: boolean;
  showAverage: boolean;
  showMaximum: boolean;
  showValues: boolean;
};

export type SmoothingDefinition = {
  method: "none" | "ema" | "moving-average";
  windowMs: number;
};

export type LongAverageDefinition = {
  enabled: boolean;
  method: "time-weighted" | "ratio-of-integrals";
};

export type UnitConversion = {
  preset: string;
  unit: string;
  scale: number;
  offset: number;
};

export type FormulaDefinition = {
  expression: string;
  unit: string;
  decimals?: number;
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
  value: number | null;
  rawValue?: number;
  updatedAt: number;
  sourceIndex: number;
  pulse: number;
  dependencyPulse?: string;
  longAverage?: number;
  statistics?: GaugeStatistics;
};

export type GaugeStatistics = {
  minimum: number;
  average: number;
  maximum: number;
  sampleCount: number;
};

export type GaugeHistoryPoint = {
  value: number;
  timestamp: number;
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

export type DbcSignal = SignalDefinition & {
  receivers: string[];
};

export type DbcMessage = {
  canId: number;
  pgn: number;
  sourceAddress: number | null;
  name: string;
  length: number;
  transmitter: string;
  signals: DbcSignal[];
};

export type DbcDatabase = {
  id: string;
  name: string;
  importedAt: number;
  messages: DbcMessage[];
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
