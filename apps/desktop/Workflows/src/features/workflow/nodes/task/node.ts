import { WorkflowNode, type WorkflowNodeInit, type WorkflowSubtask } from "../model.ts";
import { workflowTaskLayout } from "./layout.ts";

export class WorkflowTaskNode extends WorkflowNode {
  readonly nodeKind = "task" as const;
  completed: boolean;
  subtasks: WorkflowSubtask[];
  subtasksCollapsed: boolean;
  expandedHeight: number;
  sourceReminderId: string | null;

  constructor(init: Omit<WorkflowNodeInit, "nodeKind">) {
    const subtasks = init.subtasks?.map((subtask) => ({ ...subtask })) ?? [];
    const subtasksCollapsed = Boolean(init.subtasksCollapsed && subtasks.length > 0);
    const expandedHeight = Math.max(
      init.expandedHeight ?? init.height,
      workflowTaskLayout.minimumHeightFor(subtasks.length),
    );
    super({
      ...init,
      nodeKind: "task",
      height: subtasksCollapsed ? workflowTaskLayout.collapsedHeight : expandedHeight,
    });
    this.subtasks = subtasks;
    this.subtasksCollapsed = subtasksCollapsed;
    this.expandedHeight = expandedHeight;
    this.completed = workflowTaskLayout.completed(subtasks, init.completed ?? false);
    this.sourceReminderId = init.sourceReminderId ?? null;
  }
}
