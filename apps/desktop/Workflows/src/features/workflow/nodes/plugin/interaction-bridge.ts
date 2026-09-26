import type { CanvasObject, CanvasObjectPointerGesture, CanvasObjectPointerInteractionRegion } from "@productivity-os/canvas";
import type { WorkflowPluginNode } from "../index.ts";
import { workflowNodeCanInteract } from "../progression.ts";

type RegionProvider = (node: WorkflowPluginNode) => readonly CanvasObjectPointerInteractionRegion[];
type ActionHandler = (
  node: WorkflowPluginNode,
  regionId: string,
  objects: readonly CanvasObject[],
) => void;
type GestureHandler = (
  node: WorkflowPluginNode,
  regionId: string,
  gesture: CanvasObjectPointerGesture,
  objects: readonly CanvasObject[],
) => boolean | void;

let regionProvider: RegionProvider | null = null;
let actionHandler: ActionHandler | null = null;
let gestureHandler: GestureHandler | null = null;

export function setWorkflowPluginInteractionRegions(provider: RegionProvider): void {
  regionProvider = provider;
}

export function workflowPluginInteractionRegions(
  node: WorkflowPluginNode,
): readonly CanvasObjectPointerInteractionRegion[] {
  return regionProvider?.(node) ?? [];
}

export function setWorkflowPluginActionHandler(handler: ActionHandler | null): void {
  actionHandler = handler;
}

export function setWorkflowPluginGestureHandler(handler: GestureHandler | null): void {
  gestureHandler = handler;
}

export function activateWorkflowPluginGesture(
  node: WorkflowPluginNode,
  regionId: string,
  gesture: CanvasObjectPointerGesture,
  objects: readonly CanvasObject[],
): boolean {
  if (!workflowNodeCanInteract(objects, node.id)) return false;
  return gestureHandler?.(node, regionId, gesture, objects) === true;
}

export function activateWorkflowPluginInteraction(
  node: WorkflowPluginNode,
  regionId: string,
  objects: readonly CanvasObject[],
): boolean {
  if (!workflowNodeCanInteract(objects, node.id)) return false;
  actionHandler?.(node, regionId, objects);
  return false;
}
