import type { CanvasObject } from "@productivity-os/canvas";
import { WorkflowNodeButton } from "@productivity-os/workflow-plugin-sdk";
import type { WorkflowTerminatorNode } from "../index.ts";
import { applyWorkflowUpdates } from "../progression.ts";
import { renderSvgButtonIcon } from "../controls/svg-icon.ts";
import {
  currentWorkflowObjects,
  workflowCanReset,
  workflowResetUpdates,
} from "./reset.ts";
import { terminatorNodeTheme } from "./theme.ts";

const resetIcon = new URL("../../../../assets/svg/arrow-repeat-235-svgrepo-com.svg", import.meta.url).href;

type ResetButtonServices = { objects: readonly CanvasObject[] };

export const workflowResetButton = new WorkflowNodeButton<
  WorkflowTerminatorNode,
  ResetButtonServices,
  boolean
>({
  id: "terminator:reset",
  bounds: (node) => ({
    x: node.width / 2 - 18,
    y: node.height / 2 - 18,
    width: 36,
    height: 36,
  }),
  icon: "reset",
  theme: terminatorNodeTheme.resetButton,
  hidden: (node) =>
    node.role !== "Start" || !workflowCanReset(currentWorkflowObjects(), node.id),
  renderIcon: (target, state) =>
    renderSvgButtonIcon(target, state, { reset: resetIcon }, 17),
  onPress({ node, services }) {
    const updates = workflowResetUpdates(services.objects, node.id);
    if (updates.length === 0) return false;
    applyWorkflowUpdates(services.objects, updates);
    return true;
  },
});
