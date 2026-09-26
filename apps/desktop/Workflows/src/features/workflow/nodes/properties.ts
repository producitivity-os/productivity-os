import type { CanvasObject } from "../../../../../../packages/canvas/src/core/model/object.ts";
import type { WorkflowNode, WorkflowNodeKind } from "./index.ts";

export type WorkflowPropertyName =
  | "role"
  | "status"
  | "name"
  | "subtasks"
  | "duration"
  | "label"
  | "destination";

const FIELDS_BY_KIND: Readonly<
  Record<WorkflowNodeKind, readonly WorkflowPropertyName[]>
> = {
  terminator: ["role", "name"],
  task: ["name", "subtasks"],
  timer: ["name", "duration"],
  milestone: ["name", "status"],
  link: ["label", "destination"],
  plugin: [],
};

export class WorkflowNodePropertySelection {
  static from(
    objects: readonly CanvasObject[],
  ): WorkflowNodePropertySelection | null {
    if (objects.length === 0 || !objects.every(isWorkflowPropertyNode))
      return null;
    const nodes = objects as readonly WorkflowNode[];
    const nodeKind = nodes[0].nodeKind;
    if (!nodes.every((node) => node.nodeKind === nodeKind)) return null;
    return new WorkflowNodePropertySelection(nodes, nodeKind);
  }

  readonly fields: readonly WorkflowPropertyName[];
  readonly nodes: readonly WorkflowNode[];
  readonly nodeKind: WorkflowNodeKind;

  private constructor(
    nodes: readonly WorkflowNode[],
    nodeKind: WorkflowNodeKind,
  ) {
    this.nodes = nodes;
    this.nodeKind = nodeKind;
    this.fields = FIELDS_BY_KIND[nodeKind];
  }

  common<T>(read: (node: WorkflowNode) => T): T | undefined {
    const first = read(this.nodes[0]);
    return this.nodes.every((node) => Object.is(read(node), first))
      ? first
      : undefined;
  }

  patch(
    updateObject: (objectId: string, patch: Partial<CanvasObject>) => boolean,
    patch: Partial<WorkflowNode>,
  ): void {
    for (const node of this.nodes)
      updateObject(node.id, patch as Partial<CanvasObject>);
  }

  patchEach(
    updateObject: (objectId: string, patch: Partial<CanvasObject>) => boolean,
    createPatch: (node: WorkflowNode) => Partial<WorkflowNode>,
  ): void {
    for (const node of this.nodes)
      updateObject(node.id, createPatch(node) as Partial<CanvasObject>);
  }
}

function isWorkflowPropertyNode(object: CanvasObject): object is WorkflowNode {
  return (
    object.type === "workflow-node" &&
    ["terminator", "task", "timer", "milestone", "link", "plugin"].includes(
      (object as { nodeKind?: string }).nodeKind ?? "",
    )
  );
}
