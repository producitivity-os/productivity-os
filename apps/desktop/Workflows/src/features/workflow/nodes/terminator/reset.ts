import type { CanvasObject } from "../../../../../../../packages/canvas/src/core/model/object.ts";
import {
  isWorkflowNode,
  type WorkflowTimerNode,
  type WorkflowResetSchedule,
  type WorkflowTaskNode,
  type WorkflowTerminatorNode,
  type WorkflowPluginNode,
} from "../index.ts";
import { outgoingWorkflowNodes, type WorkflowObjectUpdate } from "../progression.ts";
import { resetWorkflowPluginData } from "../plugin/reset-bridge.ts";

let objectsProvider: () => readonly CanvasObject[] = () => [];

export function setWorkflowObjectsProvider(
  provider: (() => readonly CanvasObject[]) | null,
): void {
  objectsProvider = provider ?? (() => []);
}

export function currentWorkflowObjects(): readonly CanvasObject[] {
  return objectsProvider();
}

export function workflowResetIsDue(
  schedule: WorkflowResetSchedule,
  now = Date.now(),
): boolean {
  if (schedule.kind === "never" || !schedule.lastResetAt) return false;
  if (schedule.kind === "interval")
    return now - schedule.lastResetAt >= schedule.everyHours * 60 * 60 * 1_000;
  const previous = new Date(schedule.lastResetAt);
  const current = new Date(now);
  return (
    previous.getFullYear() !== current.getFullYear() ||
    previous.getMonth() !== current.getMonth() ||
    previous.getDate() !== current.getDate()
  );
}

export function workflowResetUpdates(
  objects: readonly CanvasObject[],
  startId: string,
  now = Date.now(),
): WorkflowObjectUpdate[] {
  const start = objects.find(
    (object): object is WorkflowTerminatorNode =>
      isWorkflowNode(object) &&
      object.nodeKind === "terminator" &&
      object.id === startId &&
      (object as WorkflowTerminatorNode).role === "Start",
  );
  if (!start) return [];

  const queue = [...outgoingWorkflowNodes(objects, start.id)];
  const reachable = new Map<string, ReturnType<typeof queue.shift>>();
  while (queue.length) {
    const node = queue.shift()!;
    if (reachable.has(node.id)) continue;
    reachable.set(node.id, node);
    queue.push(...outgoingWorkflowNodes(objects, node.id));
  }

  const updates: WorkflowObjectUpdate[] = [
    {
      objectId: start.id,
      patch: {
        resetSchedule: { ...start.resetSchedule, lastResetAt: now },
      } as Partial<CanvasObject>,
    },
  ];
  for (const node of reachable.values()) {
    if (!node) continue;
    const patch: Record<string, unknown> = {};
    if (node.nodeKind === "task") {
      const task = node as WorkflowTaskNode;
      patch.completed = false;
      patch.subtasks = task.subtasks.map((subtask) => ({ ...subtask, completed: false }));
    } else if (node.nodeKind === "timer") {
      const timer = node as WorkflowTimerNode;
      patch.elapsedMs = 0;
      patch.startedAt = null;
      patch.timerStatus = "idle";
      if (timer.durationMs <= 0) patch.durationMs = 25 * 60 * 1_000;
    } else if (node.nodeKind === "plugin") {
      const plugin = node as WorkflowPluginNode;
      patch.completed = false;
      patch.pluginData = resetWorkflowPluginData(
        plugin.pluginId,
        plugin.pluginNodeType,
        plugin.pluginData,
      );
    } else if (node.nodeKind === "milestone") {
      patch.status = "pending";
    }
    updates.push({ objectId: node.id, patch: patch as Partial<CanvasObject> });
  }

  return updates;
}

export function workflowCanReset(
  objects: readonly CanvasObject[],
  startId: string,
): boolean {
  const start = objects.find(
    (object): object is WorkflowTerminatorNode =>
      isWorkflowNode(object) &&
      object.nodeKind === "terminator" &&
      object.id === startId &&
      (object as WorkflowTerminatorNode).role === "Start",
  );
  if (!start) return false;
  const queue = [...outgoingWorkflowNodes(objects, start.id)];
  const visited = new Set<string>();
  while (queue.length) {
    const node = queue.shift()!;
    if (visited.has(node.id)) continue;
    visited.add(node.id);
    if (node.nodeKind === "task") {
      const task = node as WorkflowTaskNode;
      if (task.completed || task.subtasks.some((subtask) => subtask.completed)) return true;
    } else if (node.nodeKind === "timer") {
      const timer = node as WorkflowTimerNode;
      if (timer.timerStatus !== "idle" || timer.elapsedMs > 0 || timer.startedAt !== null)
        return true;
    } else if (node.nodeKind === "milestone") {
      if ((node as { status?: string }).status !== "pending") return true;
    } else if (node.nodeKind === "plugin") {
      const plugin = node as WorkflowPluginNode;
      const emptyData = resetWorkflowPluginData(
        plugin.pluginId,
        plugin.pluginNodeType,
        plugin.pluginData,
      );
      if (plugin.completed || JSON.stringify(plugin.pluginData) !== JSON.stringify(emptyData))
        return true;
    }
    queue.push(...outgoingWorkflowNodes(objects, node.id));
  }
  return false;
}

export function dueWorkflowResetUpdates(
  objects: readonly CanvasObject[],
  now = Date.now(),
): WorkflowObjectUpdate[] {
  const merged = new Map<string, Partial<CanvasObject>>();
  for (const object of objects) {
    if (
      !isWorkflowNode(object) ||
      object.nodeKind !== "terminator" ||
      (object as WorkflowTerminatorNode).role !== "Start" ||
      !workflowResetIsDue((object as WorkflowTerminatorNode).resetSchedule, now)
    )
      continue;
    for (const update of workflowResetUpdates(objects, object.id, now))
      merged.set(update.objectId, { ...(merged.get(update.objectId) ?? {}), ...update.patch });
  }
  return [...merged].map(([objectId, patch]) => ({ objectId, patch }));
}
