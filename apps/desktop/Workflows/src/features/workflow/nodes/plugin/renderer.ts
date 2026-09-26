import { Graphics, type Container } from "pixi.js";
import type { CanvasRenderContext } from "../../../../../../../packages/canvas/src/core/engine/renderers/renderer.ts";
import type { WorkflowPluginNode } from "../index.ts";
import { nodeLabel } from "../rendering.ts";
import { workflowNodeTheme } from "../theme.ts";
import { renderWorkflowPlugin } from "./render-bridge.ts";

export function renderPluginNode(
  root: Container,
  node: WorkflowPluginNode,
  context: CanvasRenderContext,
): void {
  if (renderWorkflowPlugin(root, node, context)) return;
  root.addChild(
    new Graphics()
      .roundRect(0, 0, node.width, node.height, 20)
      .fill({ color: workflowNodeTheme.unavailableSurface })
      .stroke({ color: workflowNodeTheme.unavailableBorder, width: 1.5 }),
    nodeLabel("Plugin unavailable", 16, node.height / 2, 12, workflowNodeTheme.muted, "left"),
  );
}
