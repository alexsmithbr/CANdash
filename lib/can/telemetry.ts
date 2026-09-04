import type { GaugeStatistics, LongAverageDefinition, SmoothingDefinition } from "./types";

export type SmoothingState = {
  lastTimestamp?: number;
  value?: number;
  samples: Array<{ timestamp: number; value: number }>;
};

export type AverageState = {
  lastTimestamp?: number;
  lastValue?: number;
  weightedSum: number;
  duration: number;
  lastNumerator?: number;
  lastDenominator?: number;
  numeratorIntegral: number;
  denominatorIntegral: number;
};

export type StatisticsState = {
  lastTimestamp?: number;
  lastValue?: number;
  weightedSum: number;
  duration: number;
  minimum?: number;
  maximum?: number;
  sampleCount: number;
};

export function newSmoothingState(): SmoothingState {
  return { samples: [] };
}

export function newAverageState(): AverageState {
  return { weightedSum: 0, duration: 0, numeratorIntegral: 0, denominatorIntegral: 0 };
}

export function newStatisticsState(): StatisticsState {
  return { weightedSum: 0, duration: 0, sampleCount: 0 };
}

export function updateStatistics(value: number, timestamp: number, state: StatisticsState, maximumGapMs: number): GaugeStatistics {
  if (state.lastTimestamp != null && state.lastValue != null) {
    const elapsed = timestamp - state.lastTimestamp;
    if (elapsed > 0 && elapsed <= maximumGapMs * 2) {
      state.weightedSum += state.lastValue * elapsed;
      state.duration += elapsed;
    }
  }
  state.lastTimestamp = timestamp;
  state.lastValue = value;
  state.minimum = state.minimum == null ? value : Math.min(state.minimum, value);
  state.maximum = state.maximum == null ? value : Math.max(state.maximum, value);
  state.sampleCount += 1;
  return {
    minimum: state.minimum,
    average: state.duration > 0 ? state.weightedSum / state.duration : value,
    maximum: state.maximum,
    sampleCount: state.sampleCount,
  };
}

export function smoothValue(value: number, timestamp: number, definition: SmoothingDefinition | undefined, state: SmoothingState) {
  const method = definition?.method ?? "none";
  const windowMs = Math.max(100, definition?.windowMs ?? 3000);
  if (method === "none") { state.value = value; state.lastTimestamp = timestamp; state.samples = []; return value; }
  if (method === "ema") {
    const elapsed = state.lastTimestamp == null ? windowMs : Math.max(0, timestamp - state.lastTimestamp);
    const alpha = state.value == null ? 1 : 1 - Math.exp(-elapsed / windowMs);
    state.value = state.value == null ? value : state.value + alpha * (value - state.value);
    state.lastTimestamp = timestamp;
    return state.value;
  }
  state.samples.push({ timestamp, value });
  const cutoff = timestamp - windowMs;
  while (state.samples.length > 1 && state.samples[0].timestamp < cutoff) state.samples.shift();
  state.value = state.samples.reduce((sum, sample) => sum + sample.value, 0) / state.samples.length;
  state.lastTimestamp = timestamp;
  return state.value;
}

export function updateLongAverage(value: number, timestamp: number, definition: LongAverageDefinition | undefined, state: AverageState, maximumGapMs: number, ratio?: [number, number]) {
  if (!definition?.enabled) return undefined;
  if (state.lastTimestamp != null) {
    const elapsed = timestamp - state.lastTimestamp;
    if (elapsed > 0 && elapsed <= maximumGapMs * 2) {
      if (definition.method === "ratio-of-integrals" && state.lastNumerator != null && state.lastDenominator != null) {
        state.numeratorIntegral += state.lastNumerator * elapsed;
        state.denominatorIntegral += state.lastDenominator * elapsed;
      } else if (state.lastValue != null) {
        state.weightedSum += state.lastValue * elapsed;
        state.duration += elapsed;
      }
    }
  }
  state.lastTimestamp = timestamp;
  state.lastValue = value;
  if (ratio) { state.lastNumerator = ratio[0]; state.lastDenominator = ratio[1]; }
  if (definition.method === "ratio-of-integrals") {
    return Math.abs(state.denominatorIntegral) > Number.EPSILON ? state.numeratorIntegral / state.denominatorIntegral : value;
  }
  return state.duration > 0 ? state.weightedSum / state.duration : value;
}
