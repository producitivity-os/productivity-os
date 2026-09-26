import { Graphics, type Container } from "pixi.js";
import type { CanvasRenderContext } from "../../../../../../../packages/canvas/src/core/engine/renderers/renderer.ts";
import type { WorkflowTaskNode } from "../index.ts";
import { nodeLabel, wrappedNodeLabel } from "../rendering.ts";
import { taskAddButton } from "./controls.ts";
import { workflowTaskLayout } from "./layout.ts";
import { taskNodeTheme } from "./theme.ts";
import { workflowNodeCanInteract } from "../progression.ts";
import { currentWorkflowObjects } from "../terminator/reset.ts";

export function renderWorkflowTask(
  root: Container,
  task: WorkflowTaskNode,
  context: CanvasRenderContext,
): void {
  const completed = task.completed;
  const controlsDisabled = !workflowNodeCanInteract(currentWorkflowObjects(), task.id);
  root.addChild(
    new Graphics()
      .roundRect(0, 0, task.width, task.height, 20)
      .fill({ color: completed ? taskNodeTheme.completedSurface : taskNodeTheme.surface })
      .stroke({ color: completed ? taskNodeTheme.completedBorder : taskNodeTheme.border, width: 1.5 }),
  );
  const standalone = task.subtasks.length === 0;
  if (standalone) renderStandaloneCheckbox(root, task, controlsDisabled);
  root.addChild(
    wrappedNodeLabel(
      task.name,
      standalone ? 52 : workflowTaskLayout.horizontalPadding,
      workflowTaskLayout.titleY(task.height, task.subtasks.length),
      task.width - (standalone ? 104 : workflowTaskLayout.horizontalPadding * 2 + 58),
      standalone ? 2 : 1,
      15,
      completed ? taskNodeTheme.completedText : taskNodeTheme.foreground,
      "left",
    ),
  );
  if (context.hovered || context.selected) taskAddButton.render(root, task, context);
  if (!standalone) renderSubtaskSection(root, task, controlsDisabled);
}

function renderStandaloneCheckbox(
  root: Container,
  task: WorkflowTaskNode,
  disabled: boolean,
): void {
  const bounds = workflowTaskLayout.standaloneCheckboxBounds(task.height);
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const checkbox = new Graphics()
      .circle(centerX, centerY, bounds.width / 2 - 1)
      .fill({ color: task.completed ? taskNodeTheme.accent : taskNodeTheme.surface })
      .stroke({ color: taskNodeTheme.accent, width: 1.5 });
  checkbox.alpha = disabled ? 0.45 : 1;
  root.addChild(checkbox);
  if (task.completed) renderCheck(root, centerX, centerY, disabled ? 0.45 : 1);
}

function renderSubtaskSection(
  root: Container,
  task: WorkflowTaskNode,
  disabled: boolean,
): void {
  root.addChild(
    new Graphics()
      .moveTo(0, 40)
      .lineTo(task.width, 40)
      .stroke({ color: task.completed ? taskNodeTheme.completedBorder : taskNodeTheme.divider, width: 1 }),
  );
  const collapse = workflowTaskLayout.collapseBounds(task.width);
  const centerX = collapse.x + collapse.width / 2;
  const centerY = collapse.y + collapse.height / 2;
  root.addChild(
    new Graphics()
      .moveTo(centerX - 4, centerY + (task.subtasksCollapsed ? -2 : 2))
      .lineTo(centerX, centerY + (task.subtasksCollapsed ? 2 : -2))
      .lineTo(centerX + 4, centerY + (task.subtasksCollapsed ? -2 : 2))
      .stroke({ color: taskNodeTheme.muted, width: 1.8, cap: "round", join: "round" }),
  );
  if (task.subtasksCollapsed) return;
  task.subtasks.forEach((subtask, index) => {
    const bounds = workflowTaskLayout.checkboxBounds(index);
    const centerY = workflowTaskLayout.subtaskCenterY(index);
    const centerX = bounds.x + bounds.width / 2;
    const checkbox = new Graphics()
        .circle(centerX, centerY, bounds.width / 2)
        .fill({ color: subtask.completed ? taskNodeTheme.accent : taskNodeTheme.surface })
        .stroke({ color: taskNodeTheme.accent, width: 1.5 });
    checkbox.alpha = disabled ? 0.45 : 1;
    root.addChild(checkbox);
    if (subtask.completed) renderCheck(root, centerX, centerY, disabled ? 0.45 : 1);
    const label = nodeLabel(
      subtask.name,
      workflowTaskLayout.subtaskLabelX,
      centerY,
      12,
      task.completed
        ? taskNodeTheme.completedText
        : subtask.completed
          ? taskNodeTheme.muted
          : taskNodeTheme.foreground,
      "left",
    );
    root.addChild(label);
    if (subtask.completed) {
      root.addChild(
        new Graphics()
          .moveTo(workflowTaskLayout.subtaskLabelX, centerY)
          .lineTo(
            Math.min(task.width - 16, workflowTaskLayout.subtaskLabelX + label.width),
            centerY,
          )
          .stroke({ color: taskNodeTheme.muted, width: 1.25, alpha: task.completed ? 0.72 : 1 }),
      );
    }
  });
}

function renderCheck(
  root: Container,
  centerX: number,
  centerY: number,
  alpha = 1,
): void {
  const check = new Graphics()
      .moveTo(centerX - 5, centerY)
      .lineTo(centerX - 1, centerY + 4)
      .lineTo(centerX + 6, centerY - 5)
      .stroke({ color: taskNodeTheme.surface, width: 2, cap: "round", join: "round" });
  check.alpha = alpha;
  root.addChild(check);
}
