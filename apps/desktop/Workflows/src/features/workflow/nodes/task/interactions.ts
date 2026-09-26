import type {
  CanvasObject,
  CanvasObjectPointerInteractionRegion,
} from "@productivity-os/canvas";
import type { WorkflowTaskNode } from "../index.ts";
import {
  applyWorkflowUpdates,
  workflowCompletionUpdates,
  workflowNodeCanInteract,
} from "../progression.ts";
import { taskAddButton } from "./controls.ts";
import { workflowTaskLayout } from "./layout.ts";

export function taskInteractionRegions(
  task: WorkflowTaskNode,
  disabled = false,
): readonly CanvasObjectPointerInteractionRegion[] {
  return [
    taskAddButton.interactionRegion(task)!,
    ...(task.subtasks.length === 0
      ? [{
          id: "task:toggle",
          bounds: workflowTaskLayout.standaloneCheckboxBounds(task.height),
          cursor: disabled ? "default" : "pointer",
        }]
      : [
          {
            id: "task:toggle-subtasks",
            bounds: workflowTaskLayout.collapseBounds(task.width),
            cursor: "pointer",
          },
          ...(task.subtasksCollapsed
            ? []
            : task.subtasks.map((subtask, index) => ({
                id: `subtask:${subtask.id}`,
                bounds: workflowTaskLayout.checkboxBounds(index),
                cursor: disabled ? "default" : "pointer",
              }))),
        ]),
  ];
}

export function activateTaskInteraction(
  task: WorkflowTaskNode,
  regionId: string,
  objects: readonly CanvasObject[],
): boolean {
  if (regionId === taskAddButton.id) {
    const result = taskAddButton.press(task, regionId, "", undefined);
    return typeof result === "boolean" ? result : false;
  }
  if (regionId === "task:toggle") {
    if (task.subtasks.length > 0) return false;
    if (!workflowNodeCanInteract(objects, task.id)) return false;
    if (task.completed) {
      task.completed = false;
      return true;
    }
    applyWorkflowUpdates(
      objects,
      workflowCompletionUpdates(objects, task.id, {
        completed: true,
      } as Partial<CanvasObject>),
    );
    return true;
  }
  if (regionId === "task:toggle-subtasks") {
    if (task.subtasks.length === 0) return false;
    if (task.subtasksCollapsed) {
      task.subtasksCollapsed = false;
      task.height = Math.max(
        task.expandedHeight,
        workflowTaskLayout.minimumHeightFor(task.subtasks.length),
      );
    } else {
      task.expandedHeight = Math.max(
        task.height,
        workflowTaskLayout.minimumHeightFor(task.subtasks.length),
      );
      task.subtasksCollapsed = true;
      task.height = workflowTaskLayout.collapsedHeight;
    }
    return true;
  }
  if (!regionId.startsWith("subtask:") || !workflowNodeCanInteract(objects, task.id))
    return false;
  const index = task.subtasks.findIndex(
    (subtask) => subtask.id === regionId.slice("subtask:".length),
  );
  if (index < 0) return false;
  const wasCompleted = task.completed;
  task.subtasks = task.subtasks.map((subtask, candidateIndex) =>
    candidateIndex === index
      ? { ...subtask, completed: !subtask.completed }
      : { ...subtask },
  );
  task.completed = workflowTaskLayout.completed(task.subtasks, task.completed);
  if (!wasCompleted && task.completed)
    applyWorkflowUpdates(objects, workflowCompletionUpdates(objects, task.id, {}));
  return true;
}
