"use client";

import { ChevronLeft, ChevronRight, GripVertical, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatHex } from "@/lib/can/j1939";
import type { GaugeDefinition, GaugeReading } from "@/lib/can/types";

type Props = {
  gauge: GaugeDefinition;
  reading?: GaugeReading;
  now: number;
  editing: boolean;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
};

function point(angle: number, radius: number) {
  const radians = ((angle - 90) * Math.PI) / 180;
  return { x: 100 + radius * Math.cos(radians), y: 100 + radius * Math.sin(radians) };
}

function arcPath(start: number, end: number, radius: number) {
  const a = point(start, radius), b = point(end, radius);
  return `M ${a.x} ${a.y} A ${radius} ${radius} 0 ${end - start > 180 ? 1 : 0} 1 ${b.x} ${b.y}`;
}

function RadialGauge({ gauge, value, stale }: { gauge: GaugeDefinition; value?: number; stale: boolean }) {
  const max = gauge.maximum ?? 100;
  const bounded = Math.max(gauge.minimum, Math.min(max, value ?? gauge.minimum));
  const ratio = (bounded - gauge.minimum) / Math.max(0.0001, max - gauge.minimum);
  const end = 135 + 270 * ratio;
  const major = gauge.gaugeType === "speedometer" || gauge.gaugeType === "tachometer";
  return (
    <div className={`relative mx-auto ${major ? "h-52 w-52" : "h-40 w-40"}`}>
      <svg viewBox="0 0 200 200" className="h-full w-full" aria-hidden="true">
        <path d={arcPath(135, 405, 78)} fill="none" stroke="#263633" strokeWidth="12" strokeLinecap="round" />
        <path d={arcPath(135, end, 78)} fill="none" stroke={stale ? "#52635e" : "#2ee59d"} strokeWidth="12" strokeLinecap="round" className="gauge-glow transition-all duration-150" />
        {Array.from({ length: 11 }, (_, index) => {
          const angle = 135 + index * 27, p1 = point(angle, 63), p2 = point(angle, 69);
          return <line key={index} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#77908a" strokeWidth="2" />;
        })}
        <line x1="100" y1="100" x2={point(end, 59).x} y2={point(end, 59).y} stroke={stale ? "#64736f" : "#f4fffb"} strokeWidth="3" strokeLinecap="round" className="transition-all duration-150" />
        <circle cx="100" cy="100" r="7" fill={stale ? "#53635f" : "#2ee59d"} />
      </svg>
      <div className="absolute inset-x-0 bottom-6 text-center">
        <div className={`font-mono text-3xl font-semibold tracking-tight ${stale ? "text-muted-foreground" : "text-foreground"}`}>
          {stale || value == null ? "—" : value.toFixed(gauge.sources[0].signal.decimals ?? 1)}
        </div>
        <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-[.18em] text-muted-foreground">{gauge.sources[0].signal.unit}</div>
      </div>
    </div>
  );
}

function NumericGauge({ gauge, value, stale }: { gauge: GaugeDefinition; value?: number; stale: boolean }) {
  const signal = gauge.sources[0].signal;
  const formatted = stale || value == null ? "—" : gauge.gaugeType === "odometer"
    ? value.toLocaleString(undefined, { minimumFractionDigits: signal.decimals ?? 1, maximumFractionDigits: signal.decimals ?? 1 })
    : value.toFixed(signal.decimals ?? 1);
  const ratio = gauge.maximum == null || value == null ? 0 : Math.max(0, Math.min(1, (value - gauge.minimum) / (gauge.maximum - gauge.minimum)));
  return (
    <div className="flex min-h-36 flex-col justify-center">
      <div className={`font-mono text-4xl font-semibold tracking-[-.05em] ${stale ? "text-muted-foreground" : "text-foreground"}`}>{formatted}</div>
      <div className="mt-2 text-xs font-semibold uppercase tracking-[.18em] text-muted-foreground">{signal.unit}</div>
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

export function GaugeCard({ gauge, reading, now, editing, onMove, onRemove }: Props) {
  const stale = !reading || now - reading.updatedAt > gauge.staleAfterMs;
  const source = gauge.sources[reading?.sourceIndex ?? 0] ?? gauge.sources[0];
  const major = gauge.gaugeType === "speedometer" || gauge.gaugeType === "tachometer";
  return (
    <article className={`gauge-card group relative overflow-hidden rounded-xl border bg-card/90 p-4 ${major ? "sm:row-span-2" : ""}`}>
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-card-foreground">{gauge.title}</h3>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[.08em] text-muted-foreground">
            SA {source.sourceAddress == null ? "ANY" : formatHex(source.sourceAddress, 2)} · PGN {formatHex(source.pgn, 5)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span key={reading?.pulse ?? 0} title={stale ? "No recent update" : "Fresh update"} className={`size-2.5 rounded-full ${stale ? "bg-[#40504c]" : "led-pulse bg-primary"}`} />
          {editing && <GripVertical className="size-4 text-muted-foreground" />}
        </div>
      </header>
      <div className="mt-2">
        {major || gauge.gaugeType === "radial" ? <RadialGauge gauge={gauge} value={reading?.value} stale={stale} /> : <NumericGauge gauge={gauge} value={reading?.value} stale={stale} />}
      </div>
      <footer className="mt-1 flex items-center justify-between border-t pt-3 text-[10px] text-muted-foreground">
        <span>{source.messageName ?? "CUSTOM"}.{source.signal.name}</span>
        <span>{stale ? "STALE" : `${Math.max(0, now - (reading?.updatedAt ?? now)).toFixed(0)} ms`}</span>
      </footer>
      {editing && (
        <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-card/95 p-2 backdrop-blur">
          <Button size="icon-xs" variant="ghost" onClick={() => onMove(-1)} aria-label={`Move ${gauge.title} left`}><ChevronLeft /></Button>
          <Button size="icon-xs" variant="ghost" onClick={() => onMove(1)} aria-label={`Move ${gauge.title} right`}><ChevronRight /></Button>
          <Button size="icon-xs" variant="ghost" onClick={onRemove} aria-label={`Remove ${gauge.title}`} className="text-destructive"><Trash2 /></Button>
        </div>
      )}
    </article>
  );
}
