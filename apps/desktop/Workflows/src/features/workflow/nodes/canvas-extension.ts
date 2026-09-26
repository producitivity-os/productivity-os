import type { CanvasObjectExtension } from "../../../../../../packages/canvas/src/core/types/extensions.ts";
import {
  hydrateWorkflowNode,
  type WorkflowNode,
  type WorkflowTimerNode,
  type WorkflowTaskNode,
  type WorkflowTerminatorNode,
  type WorkflowPluginNode,
} from "./index.ts";
import { WorkflowNodeRenderer } from "./renderer.ts";
import { workflowTaskLayout } from "./task/layout.ts";
import { timerButton } from "./timer/lifecycle.ts";
import {
  activateWorkflowPluginInteraction,
  activateWorkflowPluginGesture,
  workflowPluginInteractionRegions,
} from "./plugin/interaction-bridge.ts";
import { workflowResetButton } from "./terminator/control.ts";
import { currentWorkflowObjects } from "./terminator/reset.ts";
import {
  activateTaskInteraction,
  taskInteractionRegions,
} from "./task/interactions.ts";
import { workflowNodeCanInteract } from "./progression.ts";
import { workflowPluginOutlineRadius } from "./plugin/outline-bridge.ts";

const WORKFLOW_SELECTION_BLUE = 0x60a5fa;

export const workflowNodeExtension: CanvasObjectExtension<WorkflowNode> = {
  type: "workflow-node",
  hydrate: hydrateWorkflowNode,
  createRenderer: () => new WorkflowNodeRenderer(),
  permanentConnectionHandles: true,
  connectionHandles: (node) => {
    if (node.nodeKind === "terminator") {
      return (node as WorkflowTerminatorNode).role === "End"
        ? [
            {
              hint: "left",
              anchor: { x: 0, y: 0.5 },
              direction: "input",
              shape: "rounded-rectangle",
            },
          ]
        : [
            {
              hint: "right",
              anchor: { x: 1, y: 0.5 },
              direction: "output",
              shape: "rounded-rectangle",
            },
          ];
    }
    return [
      {
        hint: "left",
        anchor: { x: 0, y: 0.5 },
        direction: "input",
        shape: "rounded-rectangle",
      },
      {
        hint: "right",
        anchor: { x: 1, y: 0.5 },
        direction: "output",
        shape: "rounded-rectangle",
      },
    ];
  },
  selectionGeometry: (node) => {
    if (node.nodeKind === "terminator")
      return (node as WorkflowTerminatorNode).role === "End"
        ? {
            shape: "rectangle",
            radius: 28,
            strokeWidth: 1.5,
            strokeColor: WORKFLOW_SELECTION_BLUE,
          }
        : {
            shape: "ellipse",
            strokeWidth: 1.5,
            strokeColor: WORKFLOW_SELECTION_BLUE,
          };
    if (node.nodeKind === "milestone")
      return {
        shape: "diamond",
        strokeWidth: 1.5,
        strokeColor: WORKFLOW_SELECTION_BLUE,
      };
    return {
      shape: "rectangle",
      radius:
        node.nodeKind === "plugin"
          ? (workflowPluginOutlineRadius(node as WorkflowPluginNode) ?? 20)
          : 20,
      strokeWidth: 1.5,
      strokeColor: WORKFLOW_SELECTION_BLUE,
    };
  },
  minimumSize: (node) =>
    node.nodeKind === "task"
      ? {
          width: 120,
          height: workflowTaskLayout.minimumHeightFor(
            (node as WorkflowTaskNode).subtasks.length,
          ),
        }
      : node.nodeKind === "timer"
        ? { width: 200, height: 64 }
        : null,
  pointerInteractionRegions: (node) => {
    if (node.nodeKind === "terminator") {
      const region = workflowResetButton.interactionRegion(
        node as WorkflowTerminatorNode,
      );
      return region ? [region] : [];
    }
    if (node.nodeKind === "task") {
      return taskInteractionRegions(
        node as WorkflowTaskNode,
        !workflowNodeCanInteract(currentWorkflowObjects(), node.id),
      );
    }
    return node.nodeKind === "timer"
      ? [
          timerButton.interactionRegion(node as WorkflowTimerNode, {
            disabled: !workflowNodeCanInteract(
              currentWorkflowObjects(),
              node.id,
            ),
          }),
        ].filter((region) => region !== null)
      : node.nodeKind === "plugin"
        ? workflowPluginInteractionRegions(node as WorkflowPluginNode)
        : [];
  },
  onPointerInteraction: (node, regionId, objects = [node]) => {
    if (node.nodeKind === "terminator" && regionId === "terminator:reset") {
      const result = workflowResetButton.press(
        node as WorkflowTerminatorNode,
        regionId,
        "",
        { objects },
      );
      return typeof result === "boolean" ? result : false;
    }
    if (node.nodeKind === "timer" && regionId === "timer:toggle") {
      const result = timerButton.press(
        node as WorkflowTimerNode,
        regionId,
        "",
        { objects },
        { disabled: !workflowNodeCanInteract(objects, node.id) },
      );
      return typeof result === "boolean" ? result : false;
    }
    if (node.nodeKind === "plugin")
      return activateWorkflowPluginInteraction(
        node as WorkflowPluginNode,
        regionId,
        objects,
      );
    return node.nodeKind === "task"
      ? activateTaskInteraction(node as WorkflowTaskNode, regionId, objects)
      : false;
  },
  onPointerGesture: (node, regionId, gesture, objects = [node]) =>
    node.nodeKind === "plugin"
      ? activateWorkflowPluginGesture(
          node as WorkflowPluginNode,
          regionId,
          gesture,
          objects,
        )
      : false,
};
