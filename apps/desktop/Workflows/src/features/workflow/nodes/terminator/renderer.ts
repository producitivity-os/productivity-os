import { Graphics, type Container } from "pixi.js";
import type { CanvasRenderContext } from "../../../../../../../packages/canvas/src/core/engine/renderers/renderer.ts";
import type { WorkflowTerminatorNode } from "../index.ts";
import { wrappedNodeLabel } from "../rendering.ts";
import { workflowResetButton } from "./control.ts";
import { currentWorkflowObjects, workflowCanReset } from "./reset.ts";
import { terminatorNodeTheme } from "./theme.ts";

export function renderWorkflowTerminator(
  root: Container,
  node: WorkflowTerminatorNode,
  context: CanvasRenderContext,
): void {
  const shape = new Graphics();
  if (node.role === "End")
    shape.roundRect(2, 2, node.width - 4, node.height - 4, 28);
  else
    shape.circle(node.width / 2, node.height / 2, node.width / 2 - 2);
  root.addChild(
    shape
      .fill({ color: terminatorNodeTheme.surface })
      .stroke({ color: terminatorNodeTheme.border, width: 1.5 }),
  );
  if (workflowCanReset(currentWorkflowObjects(), node.id))
    workflowResetButton.render(root, node, context);
  else
    root.addChild(
      wrappedNodeLabel(
        node.name,
        node.width / 2,
        node.height / 2,
        node.width - 22,
        2,
        15,
        terminatorNodeTheme.foreground,
        "center",
      ),
    );
}
