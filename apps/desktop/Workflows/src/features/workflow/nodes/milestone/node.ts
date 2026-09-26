import {
  WorkflowNode,
  type WorkflowMilestoneStatus,
  type WorkflowNodeInit,
} from "../model.ts";

export class WorkflowMilestoneNode extends WorkflowNode {
  readonly nodeKind = "milestone" as const;
  status: WorkflowMilestoneStatus;

  constructor(init: Omit<WorkflowNodeInit, "nodeKind">) {
    super({ ...init, nodeKind: "milestone" });
    this.status = init.status ?? "pending";
  }
}
