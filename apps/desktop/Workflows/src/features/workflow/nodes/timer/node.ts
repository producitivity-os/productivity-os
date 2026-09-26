import { WorkflowNode, type WorkflowNodeInit, type WorkflowTimerStatus } from "../model.ts";

export const DEFAULT_TIMER_DURATION_MS = 25 * 60 * 1_000;
export const MIN_TIMER_DURATION_MS = 60 * 1_000;
export const MAX_TIMER_DURATION_MS = 180 * 60 * 1_000;

export class WorkflowTimerNode extends WorkflowNode {
  readonly nodeKind = "timer" as const;
  durationMs: number;
  elapsedMs: number;
  startedAt: number | null;
  timerStatus: WorkflowTimerStatus;

  constructor(init: Omit<WorkflowNodeInit, "nodeKind">) {
    super({
      ...init,
      nodeKind: "timer",
      name: init.name ?? "Timer",
      width: init.width || 260,
      height: init.height || 64,
    });
    this.durationMs = Math.min(
      MAX_TIMER_DURATION_MS,
      Math.max(MIN_TIMER_DURATION_MS, init.durationMs ?? DEFAULT_TIMER_DURATION_MS),
    );
    this.elapsedMs = Math.min(this.durationMs, Math.max(0, init.elapsedMs ?? 0));
    this.startedAt = Number.isFinite(init.startedAt) ? init.startedAt! : null;
    this.timerStatus = init.timerStatus ?? "idle";
    if (this.elapsedMs >= this.durationMs) {
      this.elapsedMs = this.durationMs;
      this.startedAt = null;
      this.timerStatus = "completed";
    } else if (this.timerStatus === "running" && this.startedAt === null) {
      this.timerStatus = this.elapsedMs > 0 ? "paused" : "idle";
    } else if (this.timerStatus !== "running") {
      this.startedAt = null;
    }
  }
}
