import { Graphics, type Container } from "pixi.js";
import type { WorkflowMilestoneNode } from "../index.ts";
import { nodeLabel, wrappedNodeLabel } from "../rendering.ts";
import { milestoneNodeTheme } from "./theme.ts";

export function renderWorkflowMilestone(root: Container, node: WorkflowMilestoneNode): void {
  root.addChild(
    new Graphics()
      .moveTo(node.width / 2, 0)
      .lineTo(node.width, node.height / 2)
      .lineTo(node.width / 2, node.height)
      .lineTo(0, node.height / 2)
      .closePath()
      .fill({ color: milestoneNodeTheme.surface })
      .stroke({ color: milestoneNodeTheme.border, width: 1.5 }),
    wrappedNodeLabel(
      node.name,
      node.width / 2,
      node.height / 2 - 8,
      node.width - 28,
      1,
      14,
      milestoneNodeTheme.foreground,
      "center",
    ),
    nodeLabel(
      node.status,
      node.width / 2,
      node.height / 2 + 14,
      10,
      milestoneNodeTheme.muted,
      "center",
    ),
  );
}
