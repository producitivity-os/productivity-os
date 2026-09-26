import type { WorkflowPluginNode } from "../index.ts";

type WorkflowPluginOutlineRadiusResolver = (
  node: WorkflowPluginNode,
) => number | null;

let resolver: WorkflowPluginOutlineRadiusResolver | null = null;

export function setWorkflowPluginOutlineRadiusResolver(
  next: WorkflowPluginOutlineRadiusResolver,
): void {
  resolver = next;
}

export function workflowPluginOutlineRadius(
  node: WorkflowPluginNode,
): number | null {
  return resolver?.(node) ?? null;
}
