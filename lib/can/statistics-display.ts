import type { GaugeDefinition, StatisticsDisplayDefinition } from "./types";

export function normalizedStatisticsDisplay(gauge: Pick<GaugeDefinition, "statisticsDisplay" | "showStatistics">): StatisticsDisplayDefinition {
  return {
    enabled: gauge.statisticsDisplay?.enabled ?? Boolean(gauge.showStatistics),
    showMinimum: gauge.statisticsDisplay?.showMinimum ?? true,
    showAverage: gauge.statisticsDisplay?.showAverage ?? true,
    showMaximum: gauge.statisticsDisplay?.showMaximum ?? true,
    showValues: gauge.statisticsDisplay?.showValues ?? true,
  };
}
