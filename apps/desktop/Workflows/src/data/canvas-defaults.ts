import {
  ArrowObject,
  RectangleObject,
  TextObject,
  type EndlessCanvasState,
} from "@productivity-os/canvas";
import type { CanvasType } from "@/api/canvas-data";
import {
  WorkflowTerminatorNode,
  type WorkflowPluginNode,
} from "@/features/workflow/nodes";
import { migrateWorkflowPluginNode } from "@/features/workflow/nodes/plugin/migration-bridge";

export function createEmptyCanvasState(
  _canvasType: CanvasType = "base",
): EndlessCanvasState {
  const state: EndlessCanvasState = {
    layers: [
      {
        id: "main",
        name: "Main layer",
        zIndex: 0,
        visible: true,
        opacity: 1,
        interactionColor: 0x3b82f6,
      },
    ],
    activeLayerId: "main",
    focusedLayerId: null,
    unfocusedLayerOpacity: 0.35,
    viewport: { x: 0, y: 0, scale: 1 },
    objects: [],
  };
  return state;
}

export function createWorkflowTerminatorNode(): WorkflowTerminatorNode {
  return new WorkflowTerminatorNode({
    id: `workflow-terminator-${crypto.randomUUID()}`,
    layerId: "main",
    type: "workflow-node",
    x: 120,
    y: 120,
    width: 96,
    height: 96,
  });
}

export function normalizeWorkflowState(
  state: EndlessCanvasState,
): EndlessCanvasState {
  for (const object of state.objects) {
    if (object.type === "arrow") {
      const arrow = object as ArrowObject;
      arrow.stroke = 0x9ca3af;
      arrow.strokeWidth = 4;
      arrow.renderMode = "under";
      arrow.startHead = "none";
      arrow.endHead = "none";
    }
    if (
      object.type === "workflow-node" &&
      (object as { nodeKind?: string }).nodeKind === "plugin"
    )
      migrateWorkflowPluginNode(object as WorkflowPluginNode);
  }
  return state;
}

export function createInitialCanvasState(canvasId: string): EndlessCanvasState {
  const layers = [
    {
      id: "base",
      name: "Base",
      zIndex: 0,
      visible: true,
      opacity: 1,
      interactionColor: 0x3b82f6,
    },
    {
      id: "questions",
      name: "Questions",
      zIndex: 1,
      visible: true,
      opacity: 1,
      interactionColor: 0x8b5cf6,
    },
    {
      id: "depth",
      name: "Depth",
      zIndex: 2,
      visible: true,
      opacity: 1,
      interactionColor: 0xf59e0b,
    },
  ];
  const baseCard = new RectangleObject({
    id: `${canvasId}-base-card`,
    layerId: "base",
    type: "rect",
    x: 130,
    y: 105,
    width: 390,
    height: 235,
    fill: 0xffffff,
    stroke: 0xcbd5e1,
    strokeWidth: 2,
    cornerRadius: 18,
  });
  const questionCard = new RectangleObject({
    id: `${canvasId}-question-card`,
    layerId: "questions",
    type: "rect",
    x: 575,
    y: 125,
    width: 275,
    height: 150,
    fill: 0xffffff,
    stroke: 0xcbd5e1,
    strokeWidth: 2,
    cornerRadius: 14,
  });
  return {
    layers,
    activeLayerId: "base",
    focusedLayerId: null,
    unfocusedLayerOpacity: 0.24,
    viewport: { x: 0, y: 0, scale: 1 },
    objects: [
      baseCard,
      new TextObject({
        id: `${canvasId}-title`,
        layerId: "base",
        type: "text",
        x: 165,
        y: 140,
        width: 300,
        height: 52,
        text: "Quarterly insights",
        fontSize: 30,
        color: 0x172033,
        weight: "bold",
      }),
      new TextObject({
        id: `${canvasId}-body`,
        layerId: "base",
        type: "text",
        x: 168,
        y: 215,
        width: 300,
        height: 86,
        text: "Capture evidence, connect ideas, and turn research into shared knowledge.",
        fontSize: 17,
        color: 0x526078,
        lineHeight: 25,
      }),
      questionCard,
      new TextObject({
        id: `${canvasId}-question`,
        layerId: "questions",
        type: "text",
        x: 600,
        y: 154,
        width: 225,
        height: 80,
        text: "What evidence would change our product direction?",
        fontSize: 19,
        color: 0x172033,
        weight: "bold",
        lineHeight: 26,
      }),
      new RectangleObject({
        id: `${canvasId}-depth-card`,
        layerId: "depth",
        type: "rect",
        x: 315,
        y: 410,
        width: 410,
        height: 185,
        fill: 0xffffff,
        stroke: 0xcbd5e1,
        strokeWidth: 2,
        cornerRadius: 14,
      }),
      new TextObject({
        id: `${canvasId}-depth`,
        layerId: "depth",
        type: "text",
        x: 345,
        y: 442,
        width: 350,
        height: 110,
        text: "In-depth note\n\nCustomers value a clear narrative more than a larger collection of disconnected features.",
        fontSize: 16,
        color: 0x172033,
        lineHeight: 24,
      }),
      new ArrowObject({
        id: `${canvasId}-cross-layer-arrow`,
        layerId: "questions",
        type: "arrow",
        x: 520,
        y: 190,
        width: 55,
        height: 1,
        start: {
          point: { x: 520, y: 190 },
          binding: {
            objectId: baseCard.id,
            anchor: { x: 1, y: 0.4 },
            hint: "right",
          },
        },
        end: {
          point: { x: 575, y: 190 },
          binding: {
            objectId: questionCard.id,
            anchor: { x: 0, y: 0.43 },
            hint: "left",
          },
        },
        stroke: 0x64748b,
        strokeWidth: 3,
      }),
    ],
  };
}
