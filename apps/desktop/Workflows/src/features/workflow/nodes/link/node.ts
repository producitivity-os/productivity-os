import { WorkflowNode, type WorkflowNodeInit } from "../model.ts";

export class WorkflowLinkNode extends WorkflowNode {
  readonly nodeKind = "link" as const;
  targetCanvasId: string;
  targetCanvasTitle: string;

  constructor(init: Omit<WorkflowNodeInit, "nodeKind">) {
    super({ ...init, nodeKind: "link" });
    this.targetCanvasId = init.targetCanvasId ?? "";
    this.targetCanvasTitle = init.targetCanvasTitle ?? this.name;
  }
}
