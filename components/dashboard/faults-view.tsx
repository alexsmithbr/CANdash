"use client";

import { AlertTriangle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatHex } from "@/lib/can/j1939";
import type { DiagnosticFault } from "@/lib/can/types";

export function FaultsView({ faults }: { faults: DiagnosticFault[] }) {
  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4"><div className="flex gap-3"><AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-300" /><div><h2 className="font-semibold text-amber-100">Read-only diagnostic foundation</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-amber-100/65">DM1 faults are decoded from direct and BAM transport messages. Fault requests and clearing are intentionally disabled; those require an explicit transmit-capable operating mode and additional safety controls.</p></div></div></div>
      <div className="overflow-hidden rounded-xl border bg-card/70">
        <table className="w-full text-left text-sm"><thead className="border-b bg-muted/35 text-[10px] uppercase tracking-[.14em] text-muted-foreground"><tr><th className="px-4 py-3">ECU</th><th className="px-4 py-3">SPN</th><th className="px-4 py-3">FMI</th><th className="px-4 py-3">Count</th><th className="px-4 py-3">State</th></tr></thead><tbody className="divide-y divide-border">
          {faults.map((fault) => <tr key={fault.key}><td className="px-4 py-3 font-mono text-primary">SA {formatHex(fault.sourceAddress, 2)}</td><td className="px-4 py-3 font-mono">{fault.spn}</td><td className="px-4 py-3 font-mono">{fault.fmi}</td><td className="px-4 py-3 font-mono">{fault.occurrenceCount}</td><td className="px-4 py-3"><span className="rounded-full bg-red-400/10 px-2 py-1 text-xs text-red-300">Active</span></td></tr>)}
          {!faults.length && <tr><td colSpan={5} className="px-4 py-16 text-center"><ShieldCheck className="mx-auto mb-3 size-7 text-primary" /><p className="font-medium">No active DM1 faults observed</p><p className="mt-1 text-xs text-muted-foreground">This means none have appeared in the current data stream.</p></td></tr>}
        </tbody></table>
      </div>
      <div className="flex items-center justify-between rounded-xl border bg-card/70 p-4"><div><p className="text-sm font-medium">Transmit controls</p><p className="text-xs text-muted-foreground">Reserved for a future guarded maintenance mode.</p></div><Button variant="destructive" disabled>Clear faults</Button></div>
    </section>
  );
}
