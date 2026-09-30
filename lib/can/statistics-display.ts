import type { GaugeDefinition, GaugeStatistics, StatisticsDisplayDefinition } from "./types";

type StatisticsGauge = Pick<GaugeDefinition, "minimum" | "maximum" | "statisticsDisplay" | "showStatistics">;

export type SessionStatisticMarker = {
  key: "minimum" | "average" | "maximum";
  label: "MIN" | "AVG" | "MAX";
  value: number;
  color: string;
};

export function normalizedStatisticsDisplay(gauge: Pick<GaugeDefinition, "statisticsDisplay" | "showStatistics">): StatisticsDisplayDefinition {
  return {
    enabled: gauge.statisticsDisplay?.enabled ?? Boolean(gauge.showStatistics),
    showMinimum: gauge.statisticsDisplay?.showMinimum ?? true,
    showAverage: gauge.statisticsDisplay?.showAverage ?? true,
    showMaximum: gauge.statisticsDisplay?.showMaximum ?? true,
    showValues: gauge.statisticsDisplay?.showValues ?? true,
  };
}

export function sessionStatisticMarkers(gauge: StatisticsGauge, statistics?: GaugeStatistics): SessionStatisticMarker[] {
  const display = normalizedStatisticsDisplay(gauge);
  if (!statistics || !display.enabled) return [];
  return [
    display.showMinimum ? { key: "minimum", label: "MIN", value: statistics.minimum, color: "#f4f43a" } as const : null,
    display.showAverage ? { key: "average", label: "AVG", value: statistics.average, color: "#315cff" } as const : null,
    display.showMaximum ? { key: "maximum", label: "MAX", value: statistics.maximum, color: "#f4f43a" } as const : null,
  ].filter((marker): marker is SessionStatisticMarker => marker != null);
}

export function sessionStatisticPosition(gauge: Pick<GaugeDefinition, "minimum" | "maximum">, value: number, fallbackMaximum?: number): number {
  const maximum = gauge.maximum ?? fallbackMaximum ?? gauge.minimum + 1;
  return Math.max(0, Math.min(1, (value - gauge.minimum) / Math.max(0.0001, maximum - gauge.minimum)));
}
