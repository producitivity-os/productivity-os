import * as React from "react";
import { cn } from "../lib/utils";
import { TimePickerInput } from "./time-picker-input";

export function DurationPicker({ valueMs, onChange, minMs = 60_000, maxMs = 3 * 60 * 60_000, disabled, className }: {
  valueMs: number;
  onChange(valueMs: number): void;
  minMs?: number;
  maxMs?: number;
  disabled?: boolean;
  className?: string;
}) {
  const hoursRef = React.useRef<HTMLInputElement>(null);
  const minutesRef = React.useRef<HTMLInputElement>(null);
  const secondsRef = React.useRef<HTMLInputElement>(null);
  const clamped = Math.min(maxMs, Math.max(minMs, valueMs));
  const date = React.useMemo(() => {
    const next = new Date(0);
    next.setHours(Math.floor(clamped / 3_600_000), Math.floor(clamped / 60_000) % 60, Math.floor(clamped / 1_000) % 60, 0);
    return next;
  }, [clamped]);
  const update = (next?: Date) => {
    if (!next) return;
    const total = next.getHours() * 3_600_000 + next.getMinutes() * 60_000 + next.getSeconds() * 1_000;
    onChange(Math.min(maxMs, Math.max(minMs, total)));
  };
  return (
    <div className={cn("flex items-center gap-1", className)} aria-label="Duration">
      <TimePickerInput ref={hoursRef} picker="hours" date={date} setDate={update} disabled={disabled} aria-label="Hours" onRightFocus={() => minutesRef.current?.focus()} />
      <span className="text-muted-foreground select-none">:</span>
      <TimePickerInput ref={minutesRef} picker="minutes" date={date} setDate={update} disabled={disabled} aria-label="Minutes" onLeftFocus={() => hoursRef.current?.focus()} onRightFocus={() => secondsRef.current?.focus()} />
      <span className="text-muted-foreground select-none">:</span>
      <TimePickerInput ref={secondsRef} picker="seconds" date={date} setDate={update} disabled={disabled} aria-label="Seconds" onLeftFocus={() => minutesRef.current?.focus()} />
    </div>
  );
}
