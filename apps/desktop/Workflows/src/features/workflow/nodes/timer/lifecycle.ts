import type { CanvasObject } from "../../../../../../../packages/canvas/src/core/model/object.ts";
import { WorkflowNodeButton } from "@productivity-os/workflow-plugin-sdk";
import { type WorkflowTimerNode, isWorkflowNode } from "../index.ts";
import {
  applyWorkflowUpdates,
  workflowCompletionUpdates,
  workflowNodeCanInteract,
  type WorkflowObjectUpdate,
} from "../progression.ts";
import { timerNodeTheme } from "./theme.ts";
import { renderSvgButtonIcon } from "../controls/svg-icon.ts";

const playIcon = new URL("../../../../assets/svg/play-1003-svgrepo-com.svg", import.meta.url).href;
const pauseIcon = new URL("../../../../assets/svg/pause-1006-svgrepo-com.svg", import.meta.url).href;
const resetIcon = new URL("../../../../assets/svg/arrow-repeat-235-svgrepo-com.svg", import.meta.url).href;

type TimerButtonServices = { objects: readonly CanvasObject[] };

export const timerButton = new WorkflowNodeButton<WorkflowTimerNode, TimerButtonServices, boolean>({
  id: "timer:toggle",
  bounds: (node) => ({ x: 8, y: Math.max(0, node.height / 2 - 17), width: 34, height: 34 }),
  icon: (node) => node.timerStatus === "running" ? "pause" : node.timerStatus === "completed" ? "reset" : "play",
  theme: (node) => node.timerStatus === "running" ? timerNodeTheme.runningButton : timerNodeTheme.button,
  radius: 17,
  renderIcon: (target, state) => renderSvgButtonIcon(target, state, {
    play: playIcon,
    pause: pauseIcon,
    reset: resetIcon,
  }),
  onPress({ node, services }) {
    const updates = toggleTimerUpdates(services.objects, node.id);
    if (updates.length === 0) return false;
    applyWorkflowUpdates(services.objects, updates);
    return true;
  },
});

export function timerElapsed(
  node: WorkflowTimerNode,
  now = Date.now(),
): number {
  const running =
    node.timerStatus === "running" && node.startedAt !== null
      ? Math.max(0, now - node.startedAt)
      : 0;
  return Math.min(node.durationMs, Math.max(0, node.elapsedMs + running));
}

export function timerProgress(
  node: WorkflowTimerNode,
  now = Date.now(),
): number {
  return Math.min(1, timerElapsed(node, now) / Math.max(1, node.durationMs));
}

export function timerRemaining(
  node: WorkflowTimerNode,
  now = Date.now(),
): number {
  return Math.max(0, node.durationMs - timerElapsed(node, now));
}

function mergeUpdates(
  target: Map<string, Partial<CanvasObject>>,
  updates: readonly WorkflowObjectUpdate[],
) {
  for (const update of updates) {
    target.set(update.objectId, {
      ...(target.get(update.objectId) ?? {}),
      ...update.patch,
    });
  }
}

export function toggleTimerUpdates(
  objects: readonly CanvasObject[],
  nodeId: string,
  now = Date.now(),
): WorkflowObjectUpdate[] {
  const node = objects.find(
    (object): object is WorkflowTimerNode =>
      isWorkflowNode(object) &&
      object.nodeKind === "timer" &&
      object.id === nodeId,
  );
  if (!node) return [];
  if (!workflowNodeCanInteract(objects, node.id)) return [];
  const updates = new Map<string, Partial<CanvasObject>>();

  if (node.timerStatus === "running") {
    const elapsedMs = timerElapsed(node, now);
    if (elapsedMs >= node.durationMs) {
      mergeUpdates(
        updates,
        workflowCompletionUpdates(objects, node.id, {
          elapsedMs: node.durationMs,
          startedAt: null,
          timerStatus: "completed",
        } as Partial<CanvasObject>),
      );
    } else {
      updates.set(node.id, {
        elapsedMs,
        startedAt: null,
        timerStatus: "paused",
      } as Partial<CanvasObject>);
    }
  } else {
    for (const object of objects) {
      if (
        !isWorkflowNode(object) ||
        object.nodeKind !== "timer" ||
        object.id === node.id
      )
        continue;
      const timer = object as WorkflowTimerNode;
      if (timer.timerStatus !== "running") continue;
      const elapsedMs = timerElapsed(timer, now);
      if (elapsedMs >= timer.durationMs) {
        mergeUpdates(
          updates,
          workflowCompletionUpdates(objects, timer.id, {
            elapsedMs: timer.durationMs,
            startedAt: null,
            timerStatus: "completed",
          } as Partial<CanvasObject>),
        );
      } else {
        updates.set(timer.id, {
          elapsedMs,
          startedAt: null,
          timerStatus: "paused",
        } as Partial<CanvasObject>);
      }
    }
    updates.set(node.id, {
      ...(updates.get(node.id) ?? {}),
      elapsedMs: node.timerStatus === "completed" ? 0 : node.elapsedMs,
      startedAt: now,
      timerStatus: "running",
    } as Partial<CanvasObject>);
  }

  return [...updates].map(([objectId, patch]) => ({ objectId, patch }));
}

export function expiredTimerUpdates(
  objects: readonly CanvasObject[],
  now = Date.now(),
): WorkflowObjectUpdate[] {
  const updates = new Map<string, Partial<CanvasObject>>();
  for (const object of objects) {
    if (!isWorkflowNode(object) || object.nodeKind !== "timer") continue;
    const timer = object as WorkflowTimerNode;
    if (
      timer.timerStatus !== "running" ||
      timerElapsed(timer, now) < timer.durationMs
    )
      continue;
    mergeUpdates(
      updates,
      workflowCompletionUpdates(objects, timer.id, {
        elapsedMs: timer.durationMs,
        startedAt: null,
        timerStatus: "completed",
      } as Partial<CanvasObject>),
    );
  }
  return [...updates].map(([objectId, patch]) => ({ objectId, patch }));
}

/**
 * Reconciles persisted timers after a workflow is loaded. The newest running
 * timer wins; older running timers are paused at their wall-clock progress.
 */
export function normalizeTimerUpdates(
  objects: readonly CanvasObject[],
  now = Date.now(),
): WorkflowObjectUpdate[] {
  const running = objects
    .filter(
      (object): object is WorkflowTimerNode =>
        isWorkflowNode(object) &&
        object.nodeKind === "timer" &&
        (object as WorkflowTimerNode).timerStatus === "running",
    )
    .sort((left, right) => (right.startedAt ?? 0) - (left.startedAt ?? 0));
  const updates = new Map<string, Partial<CanvasObject>>();
  for (const [index, timer] of running.entries()) {
    const elapsedMs = timerElapsed(timer, now);
    if (elapsedMs >= timer.durationMs) {
      mergeUpdates(
        updates,
        workflowCompletionUpdates(objects, timer.id, {
          elapsedMs: timer.durationMs,
          startedAt: null,
          timerStatus: "completed",
        } as Partial<CanvasObject>),
      );
    } else if (index > 0) {
      updates.set(timer.id, {
        elapsedMs,
        startedAt: null,
        timerStatus: "paused",
      } as Partial<CanvasObject>);
    }
  }
  return [...updates].map(([objectId, patch]) => ({ objectId, patch }));
}

export function runningTimerDeadline(
  objects: readonly CanvasObject[],
): number | null {
  const timer = objects.find(
    (object): object is WorkflowTimerNode =>
      isWorkflowNode(object) &&
      object.nodeKind === "timer" &&
      (object as WorkflowTimerNode).timerStatus === "running",
  );
  if (!timer || timer.startedAt === null) return null;
  return timer.startedAt + Math.max(0, timer.durationMs - timer.elapsedMs);
}
