import type { ArrowObject } from "../../../../../../packages/canvas/src/core/model/arrow/arrow.ts";
import type { CanvasObject } from "../../../../../../packages/canvas/src/core/model/object.ts";
import {
  type WorkflowNode,
  type WorkflowTimerNode,
  type WorkflowTaskNode,
  isWorkflowNode,
} from "./index.ts";

export type WorkflowObjectUpdate = {
  objectId: string;
  patch: Partial<CanvasObject>;
};

export function workflowNodeIsCompleted(node: WorkflowNode): boolean {
  return node.nodeKind === "task"
    ? (node as WorkflowTaskNode).completed
    : node.nodeKind === "timer"
      ? (node as WorkflowTimerNode).timerStatus === "completed"
      : node.nodeKind === "plugin" && Boolean((node as { completed?: boolean }).completed);
}

export function reachableWorkflowNodeIds(objects: readonly CanvasObject[]): Set<string> {
  const starts = objects.filter(
    (object): object is WorkflowNode =>
      isWorkflowNode(object) &&
      object.nodeKind === "terminator" &&
      (object as { role?: string }).role === "Start",
  );
  const reachable = new Set<string>();
  const queue = starts.flatMap((start) => outgoingWorkflowNodes(objects, start.id));
  while (queue.length) {
    const node = queue.shift()!;
    if (reachable.has(node.id)) continue;
    reachable.add(node.id);
    queue.push(...outgoingWorkflowNodes(objects, node.id));
  }
  return reachable;
}

/** Reports whether a node is the next incomplete step; never gate direct controls with this. */
export function workflowNodeCanExecute(objects: readonly CanvasObject[], nodeId: string): boolean {
  const node = objects.find((object): object is WorkflowNode => isWorkflowNode(object) && object.id === nodeId);
  if (!node || workflowNodeIsCompleted(node)) return false;
  return workflowEntryNodes(objects).some((candidate) => candidate.id === nodeId);
}

/**
 * Direct controls follow graph membership, not ordered progression. A node is
 * interactive as soon as any directed path from Start reaches it.
 */
export function workflowNodeCanInteract(
  objects: readonly CanvasObject[],
  nodeId: string,
): boolean {
  return reachableWorkflowNodeIds(objects).has(nodeId);
}

export function outgoingWorkflowNodes(
  objects: readonly CanvasObject[],
  sourceId: string,
): WorkflowNode[] {
  const byId = new Map(
    objects.filter(isWorkflowNode).map((object) => [object.id, object]),
  );
  const result: WorkflowNode[] = [];
  const seen = new Set<string>();
  for (const object of objects) {
    if (object.type !== "arrow") continue;
    const arrow = object as ArrowObject;
    if (arrow.start.binding?.objectId !== sourceId) continue;
    const targetId = arrow.end.binding?.objectId;
    const target = targetId ? byId.get(targetId) : undefined;
    if (!target || target.id === sourceId || seen.has(target.id)) continue;
    seen.add(target.id);
    result.push(target);
  }
  return result;
}

export function nextExecutableWorkflowNodes(
  objects: readonly CanvasObject[],
  sourceId: string,
): WorkflowNode[] {
  const queue = [...outgoingWorkflowNodes(objects, sourceId)];
  const visited = new Set<string>([sourceId]);
  const result: WorkflowNode[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (visited.has(node.id)) continue;
    visited.add(node.id);
    if (workflowNodeIsCompleted(node)) {
      queue.push(...outgoingWorkflowNodes(objects, node.id));
      continue;
    }
    result.push(node);
  }
  return result;
}

export function workflowCompletionUpdates(
  objects: readonly CanvasObject[],
  sourceId: string,
  completionPatch: Partial<CanvasObject>,
): WorkflowObjectUpdate[] {
  if (!objects.some((object) => object.id === sourceId)) return [];
  return [{ objectId: sourceId, patch: completionPatch }];
}

export function applyWorkflowUpdates(
  objects: readonly CanvasObject[],
  updates: readonly WorkflowObjectUpdate[],
): number {
  const byId = new Map(objects.map((object) => [object.id, object]));
  let changed = 0;
  for (const update of updates) {
    const object = byId.get(update.objectId);
    if (!object) continue;
    Object.assign(object, update.patch);
    changed += 1;
  }
  return changed;
}

export function workflowEntryNodes(objects: readonly CanvasObject[]): WorkflowNode[] {
  const nodes = objects.filter(isWorkflowNode);
  const starts = nodes.filter(
    (node) =>
      node.nodeKind === "terminator" &&
      (node as { role?: string }).role === "Start",
  );
  let candidates = starts.flatMap((start) =>
    nextExecutableWorkflowNodes(objects, start.id),
  );
  const reachable = reachableWorkflowNodeIds(objects);
  candidates = candidates.filter((node) => reachable.has(node.id));
  return candidates.filter(
    (node, index) => candidates.findIndex((candidate) => candidate.id === node.id) === index,
  );
}
