import {
  CanvasObject,
  type CanvasObjectInit,
} from "../../../../../../packages/canvas/src/core/model/object.ts";

export type WorkflowNodeKind =
  | "terminator"
  | "task"
  | "timer"
  | "milestone"
  | "link"
  | "plugin";
export type BuiltInWorkflowNodeKind = Exclude<WorkflowNodeKind, "plugin">;
export type WorkflowTimerStatus = "idle" | "running" | "paused" | "completed";
export type WorkflowTerminatorRole = "Start" | "End";
export type WorkflowResetSchedule =
  | { kind: "never"; lastResetAt?: number }
  | { kind: "daily"; lastResetAt?: number }
  | { kind: "interval"; everyHours: number; lastResetAt?: number };
export type WorkflowMilestoneStatus = "pending" | "reached" | "blocked";

export type WorkflowSubtask = {
  id: string;
  name: string;
  completed: boolean;
};

export type WorkflowNodeInit = CanvasObjectInit & {
  nodeKind: WorkflowNodeKind | "start";
  role?: WorkflowTerminatorRole;
  name?: string;
  description?: string;
  /** Legacy field migrated to description during hydration. */
  note?: string;
  completed?: boolean;
  subtasks?: WorkflowSubtask[];
  subtasksCollapsed?: boolean;
  expandedHeight?: number;
  sourceReminderId?: string | null;
  status?: WorkflowMilestoneStatus;
  targetCanvasId?: string;
  targetCanvasTitle?: string;
  durationMs?: number;
  elapsedMs?: number;
  startedAt?: number | null;
  timerStatus?: WorkflowTimerStatus;
  resetSchedule?: WorkflowResetSchedule;
  pluginId?: string;
  pluginNodeType?: string;
  pluginVersion?: number;
  pluginData?: Record<string, unknown>;
};

export abstract class WorkflowNode extends CanvasObject {
  readonly type = "workflow-node" as const;
  abstract readonly nodeKind: WorkflowNodeKind;
  name: string;
  description: string;

  protected constructor(init: WorkflowNodeInit) {
    super({
      ...init,
      capabilities: {
        rotatable: false,
        movable: true,
        resizable: true,
        deletable: true,
        copyable: true,
        connectable: true,
        showConnectionHandles: true,
        ...init.capabilities,
      },
    });
    this.name = init.name ?? "Untitled";
    this.description = init.description ?? init.note ?? "";
  }
}
