import * as React from "react";
import { Input } from "./ui/input";
import { cn } from "../lib/utils";
import {
  type Period,
  type TimePickerType,
  getArrowByType,
  getDateByType,
  setDateByType,
} from "./time-picker-utils";

export interface TimePickerInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  picker: TimePickerType;
  date?: Date;
  setDate(date: Date | undefined): void;
  period?: Period;
  onRightFocus?: () => void;
  onLeftFocus?: () => void;
}

export const TimePickerInput = React.forwardRef<HTMLInputElement, TimePickerInputProps>(
  ({ className, type = "tel", value, id, name, date = new Date(0), setDate, onChange, onKeyDown, picker, period, onLeftFocus, onRightFocus, ...props }, ref) => {
    const [awaitingSecondDigit, setAwaitingSecondDigit] = React.useState(false);
    const [previousDigit, setPreviousDigit] = React.useState("0");
    React.useEffect(() => {
      if (!awaitingSecondDigit) return;
      const timer = window.setTimeout(() => setAwaitingSecondDigit(false), 2_000);
      return () => window.clearTimeout(timer);
    }, [awaitingSecondDigit]);
    const calculatedValue = React.useMemo(() => getDateByType(date, picker), [date, picker]);
    const digitValue = (key: string) => {
      if (picker === "12hours" && awaitingSecondDigit && calculatedValue[1] === "1" && previousDigit === "0") return `0${key}`;
      return awaitingSecondDigit ? `${calculatedValue[1]}${key}` : `0${key}`;
    };
    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Tab") return;
      if (event.key === "ArrowRight") { event.preventDefault(); onRightFocus?.(); return; }
      if (event.key === "ArrowLeft") { event.preventDefault(); onLeftFocus?.(); return; }
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        setAwaitingSecondDigit(false);
        setDate(setDateByType(new Date(date), getArrowByType(calculatedValue, event.key === "ArrowUp" ? 1 : -1, picker), picker, period));
        return;
      }
      if (/^\d$/.test(event.key)) {
        event.preventDefault();
        if (picker === "12hours") setPreviousDigit(event.key);
        const next = digitValue(event.key);
        if (awaitingSecondDigit) onRightFocus?.();
        setAwaitingSecondDigit((current) => !current);
        setDate(setDateByType(new Date(date), next, picker, period));
      }
    };
    return (
      <Input
        ref={ref}
        id={id || picker}
        name={name || picker}
        className={cn("w-12 text-center font-mono text-sm tabular-nums caret-transparent select-none focus:bg-accent focus:text-accent-foreground", className)}
        value={value ?? calculatedValue}
        onChange={(event) => { event.preventDefault(); onChange?.(event); }}
        type={type}
        inputMode="decimal"
        onKeyDown={(event) => { onKeyDown?.(event); if (!event.defaultPrevented) handleKeyDown(event); }}
        {...props}
      />
    );
  },
);
TimePickerInput.displayName = "TimePickerInput";
