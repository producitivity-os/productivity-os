import {
  WorkflowNode,
  type WorkflowNodeInit,
  type WorkflowResetSchedule,
  type WorkflowTerminatorRole,
} from "../model.ts";

export class WorkflowTerminatorNode extends WorkflowNode {
  readonly nodeKind = "terminator" as const;
  role: WorkflowTerminatorRole;
  resetSchedule: WorkflowResetSchedule;

  constructor(
    init: Omit<WorkflowNodeInit, "nodeKind"> & {
      nodeKind?: "terminator" | "start";
    },
  ) {
    const role = init.nodeKind === "start" ? "Start" : (init.role ?? "Start");
    super({
      ...init,
      nodeKind: "terminator",
      role,
      name: init.name ?? role,
      width: 96,
      height: 96,
      capabilities: {
        ...init.capabilities,
        rotatable: false,
        resizable: false,
        deletable: true,
        copyable: true,
        connectable: true,
        showConnectionHandles: true,
      },
    });
    this.role = role;
    const schedule = init.resetSchedule;
    this.resetSchedule = schedule?.kind === "daily"
      ? { kind: "daily", lastResetAt: schedule.lastResetAt }
      : schedule?.kind === "interval"
        ? {
            kind: "interval",
            everyHours: Math.min(720, Math.max(1, schedule.everyHours || 24)),
            lastResetAt: schedule.lastResetAt,
          }
        : { kind: "never", lastResetAt: schedule?.lastResetAt };
  }
}
