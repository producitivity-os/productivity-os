import { WorkflowNodeButton } from "@productivity-os/workflow-plugin-sdk";
import type { WorkflowTaskNode } from "../index.ts";
import { renderSvgButtonIcon } from "../controls/svg-icon.ts";
import { requestWorkflowSubtaskDraft } from "./editor-events.ts";
import { workflowTaskLayout } from "./layout.ts";
import { taskNodeTheme } from "./theme.ts";

const plusIcon = new URL("../../../../assets/svg/plus.svg", import.meta.url).href;

export const taskAddButton = new WorkflowNodeButton<WorkflowTaskNode, undefined, boolean>({
  id: "task:add-subtask",
  bounds: (node) => workflowTaskLayout.addBounds(node.width, node.subtasks.length > 0),
  icon: "plus",
  theme: taskNodeTheme.addButton,
  radius: 9,
  renderIcon: (target, state) =>
    renderSvgButtonIcon(target, state, { plus: plusIcon }, 11),
  onPress({ node }) {
    requestWorkflowSubtaskDraft(node.id);
    return false;
  },
});
