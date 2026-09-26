import { Graphics, type Container } from "pixi.js";
import type { WorkflowLinkNode } from "../index.ts";
import { nodeLabel, wrappedNodeLabel } from "../rendering.ts";
import { linkNodeTheme } from "./theme.ts";

export function renderWorkflowLink(root: Container, node: WorkflowLinkNode): void {
  root.addChild(
    new Graphics()
      .roundRect(0, 0, node.width, node.height, 20)
      .fill({ color: linkNodeTheme.surface })
      .stroke({ color: linkNodeTheme.border, width: 1.5 }),
    nodeLabel("↗", 18, node.height / 2, 18, linkNodeTheme.accent, "left"),
    wrappedNodeLabel(
      node.name,
      44,
      node.height / 2,
      node.width - 58,
      2,
      15,
      linkNodeTheme.foreground,
      "left",
    ),
  );
}
