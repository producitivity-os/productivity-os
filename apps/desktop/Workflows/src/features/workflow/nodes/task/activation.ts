import type { CanvasObject } from "../../../../../../../packages/canvas/src/core/model/object.ts";
import type { WorkflowTaskNode } from "../index.ts";
import {
  workflowCompletionUpdates,
  workflowNodeCanInteract,
  type WorkflowObjectUpdate,
} from "../progression.ts";

export class WorkflowNodeActivation {
  private readonly objects: () => readonly CanvasObject[];
  private readonly updateObjects: (
    updates: readonly WorkflowObjectUpdate[],
  ) => number;

  constructor(
    objects: () => readonly CanvasObject[],
    updateObjects: (updates: readonly WorkflowObjectUpdate[]) => number,
  ) {
    this.objects = objects;
    this.updateObjects = updateObjects;
  }

  activate(object: CanvasObject): boolean {
    if (
      object.type !== "workflow-node" ||
      (object as { nodeKind?: string }).nodeKind !== "task"
    )
      return false;
    const task = object as WorkflowTaskNode;
    if (!workflowNodeCanInteract(this.objects(), task.id)) return false;
    if (task.completed) return false;
    if (task.subtasks.length > 0) return false;
    const updates = workflowCompletionUpdates(this.objects(), task.id, {
      completed: true,
    } as Partial<WorkflowTaskNode>);
    return this.updateObjects(updates) > 0;
  }
}
