"use client";

import { ChevronLeft, ChevronRight, GripVertical, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChartContainer } from "@/components/ui/chart";
import { formatHex } from "@/lib/can/j1939";
import type { GaugeDefinition, GaugeHistoryPoint, GaugeReading } from "@/lib/can/types";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

type Props = {
  gauge: GaugeDefinition;
  reading?: GaugeReading;
  history: GaugeHistoryPoint[];
  now: number;
  editing: boolean;
  onMove: (direction: -1 | 1) => void;
  onEdit: () => void;
  onRemove: () => void;
};

function gaugeUnit(gauge: GaugeDefinition) {
  return gauge.formula?.unit ?? gauge.conversion?.unit ?? gauge.sources[0]?.signal.unit ?? "";
}

function gaugeDecimals(gauge: GaugeDefinition) {
  return gauge.formula?.decimals ?? gauge.sources[0]?.signal.decimals ?? 1;
}

function point(angle: number, radius: number) {
  const radians = ((angle - 90) * Math.PI) / 180;
  return { x: 100 + radius * Math.cos(radians), y: 100 + radius * Math.sin(radians) };
}

function gaugeArcPath(radius: number) {
  const start = point(-135, radius);
  const middle = point(0, radius);
  const end = point(135, radius);
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 0 1 ${middle.x} ${middle.y} A ${radius} ${radius} 0 0 1 ${end.x} ${end.y}`;
}

function RadialGauge({ gauge, value, stale }: { gauge: GaugeDefinition; value?: number; stale: boolean }) {
  const max = gauge.maximum ?? 100;
  const bounded = Math.max(gauge.minimum, Math.min(max, value ?? gauge.minimum));
  const ratio = (bounded - gauge.minimum) / Math.max(0.0001, max - gauge.minimum);
  const start = -135;
  const end = start + 270 * ratio;
  const major = gauge.gaugeType === "speedometer" || gauge.gaugeType === "tachometer";
  const track = gaugeArcPath(78);
  return (
    <div className={`relative mx-auto ${major ? "h-52 w-52" : "h-40 w-40"}`}>
      <svg viewBox="0 0 200 200" className="h-full w-full" aria-hidden="true">
        <path d={track} fill="none" stroke="#263633" strokeWidth="12" strokeLinecap="round" />
        <path d={track} pathLength="100" fill="none" stroke={stale ? "#52635e" : "#2ee59d"} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${ratio * 100} 100`} className="gauge-glow transition-[stroke-dasharray] duration-150" />
        {Array.from({ length: 11 }, (_, index) => {
          const angle = start + index * 27, p1 = point(angle, 63), p2 = point(angle, 69);
          return <line key={index} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#77908a" strokeWidth="2" />;
        })}
        <line x1="100" y1="100" x2={point(end, 59).x} y2={point(end, 59).y} stroke={stale ? "#64736f" : "#f4fffb"} strokeWidth="3" strokeLinecap="round" className="transition-all duration-150" />
        <circle cx="100" cy="100" r="7" fill={stale ? "#53635f" : "#2ee59d"} />
      </svg>
      <div className="absolute inset-x-0 bottom-6 text-center">
        <div className={`font-mono text-3xl font-semibold tracking-tight ${stale ? "text-muted-foreground" : "text-foreground"}`}>
          {stale || value == null ? "—" : value.toFixed(gaugeDecimals(gauge))}
        </div>
        <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-[.18em] text-muted-foreground">{gaugeUnit(gauge)}</div>
      </div>
    </div>
  );
}

function HistoryGauge({ gauge, value, history, stale }: { gauge: GaugeDefinition; value?: number; history: GaugeHistoryPoint[]; stale: boolean }) {
  const windowSeconds = Math.round((gauge.historyWindowMs ?? 30000) / 1000);
  const step = Math.max(1, Math.ceil(history.length / 240));
  const latest = history.at(-1)?.timestamp ?? 0;
  const data = history.filter((_, index) => index % step === 0 || index === history.length - 1).map((point) => ({
    seconds: (point.timestamp - latest) / 1000,
    value: point.value,
  }));
  return <div className="min-h-44 pt-2">
    <div className="flex items-baseline gap-2"><span className={`font-mono text-3xl font-semibold tracking-[-.05em] ${stale ? "text-muted-foreground" : "text-foreground"}`}>{stale || value == null ? "—" : value.toFixed(gaugeDecimals(gauge))}</span><span className="text-xs font-semibold uppercase tracking-[.14em] text-muted-foreground">{gaugeUnit(gauge)}</span></div>
    <ChartContainer config={{ value: { label: gauge.title, color: "#2ee59d" } }} className="mt-3 h-32 w-full aspect-auto" initialDimension={{ width: 420, height: 128 }}>
      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
        <CartesianGrid stroke="#263633" strokeDasharray="3 4" />
        <XAxis dataKey="seconds" type="number" domain={[-windowSeconds, 0]} hide />
        <YAxis hide domain={[gauge.minimum, gauge.maximum ?? "auto"]} />
        <Line type="linear" dataKey="value" stroke="var(--color-value)" strokeWidth={2} dot={false} isAnimationActive={false} opacity={stale ? 0.35 : 0.9} />
      </LineChart>
    </ChartContainer>
    <div className="flex justify-between font-mono text-[10px] text-muted-foreground"><span>−{windowSeconds}s</span><span>{gauge.minimum} — {gauge.maximum ?? "auto"} {gaugeUnit(gauge)}</span><span>now</span></div>
  </div>;
}

function NumericGauge({ gauge, value, stale }: { gauge: GaugeDefinition; value?: number; stale: boolean }) {
  const formatted = stale || value == null ? "—" : gauge.gaugeType === "odometer"
    ? value.toLocaleString(undefined, { minimumFractionDigits: gaugeDecimals(gauge), maximumFractionDigits: gaugeDecimals(gauge) })
    : value.toFixed(gaugeDecimals(gauge));
  const ratio = gauge.maximum == null || value == null ? 0 : Math.max(0, Math.min(1, (value - gauge.minimum) / (gauge.maximum - gauge.minimum)));
  return (
    <div className="flex min-h-36 flex-col justify-center">
      <div className={`font-mono text-4xl font-semibold tracking-[-.05em] ${stale ? "text-muted-foreground" : "text-foreground"}`}>{formatted}</div>
      <div className="mt-2 text-xs font-semibold uppercase tracking-[.18em] text-muted-foreground">{gaugeUnit(gauge)}</div>
      {gauge.gaugeType === "bar" && (
        <div className="mt-7 h-2 overflow-hidden rounded-full bg-[#263633]">
          <div className="h-full rounded-full bg-primary shadow-[0_0_14px_rgba(46,229,157,.3)] transition-[width] duration-200" style={{ width: `${ratio * 100}%` }} />
        </div>
      )}
      {gauge.maximum != null && gauge.gaugeType !== "odometer" && gauge.gaugeType !== "bar" && (
        <div className="mt-7 flex items-center gap-3 text-[10px] text-muted-foreground">
          <span>{gauge.minimum}</span><div className="h-px flex-1 bg-border"><div className="h-px bg-primary" style={{ width: `${ratio * 100}%` }} /></div><span>{gauge.maximum}</span>
        </div>
      )}
    </div>
  );
}

function TemperatureGauge({ gauge, value, stale }: { gauge: GaugeDefinition; value?: number; stale: boolean }) {
  const maximum = gauge.maximum ?? 100;
  const ratio = Math.max(0, Math.min(1, ((value ?? gauge.minimum) - gauge.minimum) / Math.max(0.0001, maximum - gauge.minimum)));
  return <div className="flex min-h-40 items-center justify-center gap-6">
    <div className="relative h-36 w-10" aria-hidden="true"><div className="absolute bottom-1 left-1/2 h-10 w-10 -translate-x-1/2 rounded-full border-[5px] border-[#263633] bg-[#263633]" /><div className="absolute bottom-8 left-1/2 h-[108px] w-4 -translate-x-1/2 overflow-hidden rounded-t-full border-4 border-[#263633] bg-[#12201d]"><div className={`absolute inset-x-0 bottom-0 transition-[height] duration-200 ${stale ? "bg-[#52635e]" : "bg-primary"}`} style={{ height: `${ratio * 100}%` }} /></div><div className={`absolute bottom-3 left-1/2 size-6 -translate-x-1/2 rounded-full ${stale ? "bg-[#52635e]" : "bg-primary shadow-[0_0_16px_rgba(46,229,157,.35)]"}`} /></div>
    <div><div className={`font-mono text-4xl font-semibold tracking-[-.05em] ${stale ? "text-muted-foreground" : "text-foreground"}`}>{stale || value == null ? "—" : value.toFixed(gaugeDecimals(gauge))}</div><div className="mt-2 text-xs font-semibold uppercase tracking-[.18em] text-muted-foreground">{gaugeUnit(gauge)}</div><p className="mt-5 font-mono text-[10px] text-muted-foreground">{gauge.minimum} — {maximum}</p></div>
  </div>;
}

export function GaugeCard({ gauge, reading, history, now, editing, onMove, onEdit, onRemove }: Props) {
  const stale = !reading || now - reading.updatedAt > gauge.staleAfterMs;
  const source = gauge.sources[reading?.sourceIndex ?? 0] ?? gauge.sources[0];
  const major = gauge.gaugeType === "speedometer" || gauge.gaugeType === "tachometer";
  return (
    <article className={`gauge-card group relative h-fit self-start overflow-hidden rounded-xl border bg-card/90 p-4 ${gauge.gaugeType === "histogram" || gauge.gaugeType === "history" ? "sm:col-span-2" : ""}`}>
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-card-foreground">{gauge.title}</h3>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[.08em] text-muted-foreground">
            {source ? <>SA {source.sourceAddress == null ? "ANY" : formatHex(source.sourceAddress, 2)} · PGN {formatHex(source.pgn, 5)}</> : "CALCULATED VALUE"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span key={reading?.pulse ?? 0} title={stale ? "No recent update" : "Fresh update"} className={`size-2.5 rounded-full ${stale ? "bg-[#40504c]" : "led-pulse bg-primary"}`} />
          {editing && <GripVertical className="size-4 text-muted-foreground" />}
        </div>
      </header>
      <div className="mt-2">
        {gauge.gaugeType === "histogram" || gauge.gaugeType === "history" ? <HistoryGauge gauge={gauge} value={reading?.value} history={history} stale={stale} /> : gauge.gaugeType === "temperature" ? <TemperatureGauge gauge={gauge} value={reading?.value} stale={stale} /> : major || gauge.gaugeType === "radial" || gauge.gaugeType === "pressure" ? <RadialGauge gauge={gauge} value={reading?.value} stale={stale} /> : <NumericGauge gauge={gauge} value={reading?.value} stale={stale} />}
      </div>
      {gauge.longAverage?.enabled && reading?.longAverage != null && <div className="mb-3 flex items-baseline justify-between rounded-md border bg-muted/20 px-3 py-2"><span className="text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">Long AVG</span><span className="font-mono text-sm font-semibold text-primary">{reading.longAverage.toFixed(gaugeDecimals(gauge))} <small className="font-sans text-[9px] font-medium uppercase text-muted-foreground">{gaugeUnit(gauge)}</small></span></div>}
      <footer className="mt-1 flex items-center justify-between border-t pt-3 text-[10px] text-muted-foreground">
        <span className="max-w-[70%] truncate">{source ? `${source.messageName ?? "CUSTOM"}.${source.signal.name}` : gauge.formula?.expression}</span>
        <span>{stale ? "STALE" : `${Math.max(0, now - (reading?.updatedAt ?? now)).toFixed(0)} ms`}</span>
      </footer>
      {editing && (
        <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-card/95 p-2 backdrop-blur">
          <Button size="icon-xs" variant="ghost" onClick={() => onMove(-1)} aria-label={`Move ${gauge.title} left`}><ChevronLeft /></Button>
          <Button size="icon-xs" variant="ghost" onClick={() => onMove(1)} aria-label={`Move ${gauge.title} right`}><ChevronRight /></Button>
          <Button size="icon-xs" variant="ghost" onClick={onEdit} aria-label={`Edit ${gauge.title}`}><Pencil /></Button>
          <Button size="icon-xs" variant="ghost" onClick={onRemove} aria-label={`Remove ${gauge.title}`} className="text-destructive"><Trash2 /></Button>
        </div>
      )}
    </article>
  );
}
