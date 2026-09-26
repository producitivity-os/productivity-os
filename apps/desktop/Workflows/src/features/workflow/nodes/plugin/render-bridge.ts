import type { Container } from "pixi.js";
import type { CanvasRenderContext } from "../../../../../../../packages/canvas/src/core/engine/renderers/renderer.ts";
import type { WorkflowPluginNode } from "../index.ts";

type WorkflowPluginRenderer = (
  target: Container,
  node: WorkflowPluginNode,
  context: CanvasRenderContext,
) => boolean;

let renderer: WorkflowPluginRenderer | null = null;

export function setWorkflowPluginRenderer(next: WorkflowPluginRenderer): void {
  renderer = next;
}

export function renderWorkflowPlugin(
  target: Container,
  node: WorkflowPluginNode,
  context: CanvasRenderContext,
): boolean {
  return renderer?.(target, node, context) ?? false;
}
