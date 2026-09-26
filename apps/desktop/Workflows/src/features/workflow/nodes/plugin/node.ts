import { WorkflowNode, type WorkflowNodeInit } from "../model.ts";

export class WorkflowPluginNode extends WorkflowNode {
  readonly nodeKind = "plugin" as const;
  pluginId: string;
  pluginNodeType: string;
  pluginVersion: number;
  pluginData: Record<string, unknown>;
  completed: boolean;

  constructor(init: Omit<WorkflowNodeInit, "nodeKind">) {
    super({ ...init, nodeKind: "plugin" });
    this.pluginId = init.pluginId ?? "unknown";
    this.pluginNodeType = init.pluginNodeType ?? "unknown";
    this.pluginVersion = Math.max(1, init.pluginVersion ?? 1);
    this.pluginData = { ...(init.pluginData ?? {}) };
    this.completed = init.completed ?? false;
  }
}
