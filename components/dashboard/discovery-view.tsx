"use client";

import { Plus, Radio, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatHex } from "@/lib/can/j1939";
import { dbcMatches } from "@/lib/can/dbc";
import type { DbcDatabase, DiscoveryEntry } from "@/lib/can/types";

export function DiscoveryView({ entries, databases, filter, onFilter, onAdd }: { entries: DiscoveryEntry[]; databases: DbcDatabase[]; filter: string; onFilter: (value: string) => void; onAdd: (entry: DiscoveryEntry) => void }) {
  const normalized = filter.trim().toLowerCase();
  const visible = entries.filter((entry) => {
    const names = dbcMatches(databases, entry.pgn, entry.sourceAddress).map(({ message }) => `${message.name} ${message.signals.map((signal) => signal.name).join(" ")}`).join(" ");
    return !normalized || `${formatHex(entry.sourceAddress, 2)} ${formatHex(entry.pgn, 5)} ${entry.pgn} ${entry.sourceAddress} ${names}`.toLowerCase().includes(normalized);
  });
  const nodeCount = new Set(entries.map((entry) => entry.sourceAddress)).size;
  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border bg-card/70 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3"><div className="rounded-lg bg-primary/10 p-2 text-primary"><Radio className="size-5" /></div><div><h2 className="font-semibold">Passive bus discovery</h2><p className="text-xs text-muted-foreground">{nodeCount} ECUs · {entries.length} source/PGN pairs observed</p></div></div>
        <div className="relative sm:w-72"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input value={filter} onChange={(e) => onFilter(e.target.value)} placeholder="Filter SA, PGN or decimal…" className="pl-9" /></div>
      </div>
      <div className="overflow-hidden rounded-xl border bg-card/70">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b bg-muted/35 text-[10px] uppercase tracking-[.14em] text-muted-foreground"><tr><th className="px-4 py-3">Source</th><th className="px-4 py-3">PGN</th><th className="px-4 py-3">DBC equivalent</th><th className="px-4 py-3">Destination</th><th className="px-4 py-3">Frames</th><th className="px-4 py-3">Rate</th><th className="px-4 py-3">Last data</th><th className="px-4 py-3" /></tr></thead>
            <tbody className="divide-y divide-border">
              {visible.map((entry) => { const matches = dbcMatches(databases, entry.pgn, entry.sourceAddress); return <tr key={entry.key} className="hover:bg-accent/35"><td className="px-4 py-3 font-mono text-primary">{formatHex(entry.sourceAddress, 2)}</td><td className="px-4 py-3"><span className="font-mono">{formatHex(entry.pgn, 5)}</span><span className="ml-2 text-xs text-muted-foreground">{entry.pgn}</span></td><td className="px-4 py-3">{matches.length ? <div className="space-y-1">{matches.slice(0, 2).map(({ database, message }) => <div key={`${database.id}-${message.canId}`}><p className="text-xs font-medium text-foreground">{message.name}</p><p className="text-[10px] text-muted-foreground">{message.signals.length} signals · {database.name}</p></div>)}{matches.length > 2 && <p className="text-[10px] text-primary">+{matches.length - 2} more</p>}</div> : <span className="text-xs text-muted-foreground">No match</span>}</td><td className="px-4 py-3 font-mono text-muted-foreground">{entry.destinationAddress == null ? "Broadcast" : formatHex(entry.destinationAddress, 2)}</td><td className="px-4 py-3 font-mono">{entry.count.toLocaleString()}</td><td className="px-4 py-3 font-mono">{entry.rate.toFixed(1)} Hz</td><td className="px-4 py-3 font-mono text-xs text-muted-foreground">{entry.lastData.map((v) => v.toString(16).padStart(2, "0").toUpperCase()).join(" ")}</td><td className="px-4 py-3 text-right"><Button size="sm" variant="outline" onClick={() => onAdd(entry)}><Plus /> Gauge</Button></td></tr>; })}
              {!visible.length && <tr><td colSpan={8} className="px-4 py-16 text-center text-muted-foreground">No matching traffic yet. Start Demo, Replay, or Live CAN.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
