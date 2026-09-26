import { Container } from "pixi.js";
import { imageTextureRevision } from "../../../../../../packages/canvas/src/core/model/image/utils.ts";
import type {
  CanvasRenderContext,
  ElementRenderer,
} from "../../../../../../packages/canvas/src/core/engine/renderers/renderer.ts";
import type {
  WorkflowLinkNode,
  WorkflowMilestoneNode,
  WorkflowNode,
  WorkflowPluginNode,
  WorkflowTaskNode,
  WorkflowTerminatorNode,
  WorkflowTimerNode,
} from "./index.ts";
import { renderWorkflowLink } from "./link/renderer.ts";
import { renderWorkflowMilestone } from "./milestone/renderer.ts";
import { renderPluginNode } from "./plugin/renderer.ts";
import {
  renderWorkflowHoverOutline,
  renderWorkflowRunningPulse,
} from "./rendering.ts";
import { renderWorkflowTask } from "./task/renderer.ts";
import { renderWorkflowTerminator } from "./terminator/renderer.ts";
import {
  currentWorkflowObjects,
  workflowCanReset,
} from "./terminator/reset.ts";
import { renderWorkflowTimer } from "./timer/renderer.ts";
import { workflowSvgIconRevision } from "./controls/svg-icon.ts";
import { workflowNodeCanInteract } from "./progression.ts";
import { workflowPluginOutlineRadius } from "./plugin/outline-bridge.ts";

/** Coordinates native node renderers; each node family owns its presentation. */
export class WorkflowNodeRenderer implements ElementRenderer<WorkflowNode> {
  invalidationKey(node: WorkflowNode, context: CanvasRenderContext): string {
    const runningFrame = this.isRunning(node)
      ? Math.floor(Date.now() / 180)
      : 0;
    return JSON.stringify([
      node,
      context,
      runningFrame,
      imageTextureRevision(),
      workflowSvgIconRevision(),
      node.nodeKind === "terminator"
        ? workflowCanReset(currentWorkflowObjects(), node.id)
        : false,
      ["task", "timer", "plugin"].includes(node.nodeKind)
        ? workflowNodeCanInteract(currentWorkflowObjects(), node.id)
        : false,
    ]);
  }

  render(
    target: Container,
    node: WorkflowNode,
    context: CanvasRenderContext,
  ): void {
    this.clear(target);
    const root = new Container();
    root.position.set(node.x + node.width / 2, node.y + node.height / 2);
    root.pivot.set(node.width / 2, node.height / 2);
    root.rotation = node.rotation;
    root.alpha = node.opacity;
    target.addChild(root);

    switch (node.nodeKind) {
      case "terminator":
        renderWorkflowTerminator(root, node as WorkflowTerminatorNode, context);
        break;
      case "task":
        renderWorkflowTask(root, node as WorkflowTaskNode, context);
        break;
      case "timer":
        renderWorkflowTimer(root, node as WorkflowTimerNode, context);
        break;
      case "milestone":
        renderWorkflowMilestone(root, node as WorkflowMilestoneNode);
        break;
      case "link":
        renderWorkflowLink(root, node as WorkflowLinkNode);
        break;
      case "plugin":
        renderPluginNode(root, node as WorkflowPluginNode, context);
        break;
    }

    if (this.isRunning(node)) renderWorkflowRunningPulse(root, node);
    if (context.hovered || context.selected)
      root.alpha = Math.min(1, node.opacity + 0.08);
    if (context.hovered)
      renderWorkflowHoverOutline(
        root,
        node,
        node.nodeKind === "plugin"
          ? (workflowPluginOutlineRadius(node as WorkflowPluginNode) ?? 20)
          : 20,
      );
  }

  private isRunning(node: WorkflowNode): boolean {
    return (
      (node.nodeKind === "timer" &&
        (node as WorkflowTimerNode).timerStatus === "running") ||
      (node.nodeKind === "plugin" &&
        (node as WorkflowPluginNode).pluginData.status === "running")
    );
  }

  private clear(target: Container): void {
    for (const child of target.removeChildren())
      child.destroy({ children: true });
  }
}
