import { Graphics, type Container } from "pixi.js";
import { WorkflowNodeProgressBar } from "@productivity-os/workflow-plugin-sdk";
import type { CanvasRenderContext } from "../../../../../../../packages/canvas/src/core/engine/renderers/renderer.ts";
import type { WorkflowTimerNode } from "../index.ts";
import { nodeLabel } from "../rendering.ts";
import { timerButton, timerProgress, timerRemaining } from "./lifecycle.ts";
import { timerNodeTheme } from "./theme.ts";
import { workflowNodeCanInteract } from "../progression.ts";
import { currentWorkflowObjects } from "../terminator/reset.ts";

const timerProgressBar = new WorkflowNodeProgressBar<WorkflowTimerNode>({
  id: "timer:progress",
  bounds: (node) => ({ x: 0, y: 0, width: node.width, height: node.height }),
  value: (node, now) => timerProgress(node, now),
  theme: timerNodeTheme.progress,
  radius: 20,
  animationDurationMs: 300,
});

export function renderWorkflowTimer(
  root: Container,
  timer: WorkflowTimerNode,
  context: CanvasRenderContext,
): void {
  timerProgressBar.render(root, timer);
  timerProgressBar.renderContent(
    root,
    timer,
    context,
    (target, node, _renderContext, inverted) =>
      renderTimerContents(target, node, inverted),
  );
  timerButton.render(root, timer, {
    ...context,
    disabled: !workflowNodeCanInteract(currentWorkflowObjects(), timer.id),
  });
  root.addChild(
    new Graphics()
      .roundRect(0, 0, timer.width, timer.height, 20)
      .stroke({
        color: timer.timerStatus === "running" ? timerNodeTheme.accent : timerNodeTheme.border,
        width: timer.timerStatus === "running" ? 2 : 1.5,
      }),
  );
}

function renderTimerContents(
  root: Container,
  timer: WorkflowTimerNode,
  inverted: boolean,
): void {
  const foreground = inverted ? timerNodeTheme.surface : timerNodeTheme.foreground;
  root.addChild(
    nodeLabel(timer.name, 50, timer.height / 2 - 11, 15, foreground, "left"),
    nodeLabel(
      timerStateLabel(timer),
      50,
      timer.height / 2 + 12,
      10,
      inverted ? timerNodeTheme.surface : timerNodeTheme.muted,
      "left",
    ),
    nodeLabel(
      formatRemaining(timerRemaining(timer)),
      timer.width - 16,
      timer.height / 2,
      13,
      foreground,
      "right",
    ),
  );
}

function formatRemaining(milliseconds: number): string {
  const seconds = Math.ceil(milliseconds / 1_000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function timerStateLabel(timer: WorkflowTimerNode): string {
  if (timer.timerStatus === "running") return "Playing";
  if (timer.timerStatus === "paused") return "Paused";
  if (timer.timerStatus === "completed") return "Completed";
  return "Ready";
}
