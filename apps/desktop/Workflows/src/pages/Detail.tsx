import * as React from "react";
import { useParams } from "react-router-dom";
import {
  CanvasSurfaceContextMenu,
  EndlessCanvas,
  type CanvasPropertiesSlotProps,
  type CanvasTool,
  type EndlessCanvasHandle,
  type EndlessCanvasOptions,
  type EndlessCanvasState,
  type CanvasConnectionDropRequest,
  type CanvasDrawnPlacement,
  type CanvasObject,
  type CanvasHistoryState,
  type CanvasObjectOverlaySlotProps,
  CanvasToolbar,
  groupForShortcut,
  groupForTool,
  nextToolForGroup,
  type CanvasToolGroupId,
} from "@productivity-os/canvas";
import { setWorkflowNodeButtonIconRenderer } from "@productivity-os/workflow-plugin-sdk";
import { createTauriCanvasClipboard } from "../api/tauri-canvas-clipboard";
import {
  SidebarInset,
  SidebarProvider,
} from "@productivity-os/shared-ui/components/ui/sidebar";

import {
  CanvasSidebar,
  type CanvasSidebarView,
} from "@/components/canvas-sidebar";
import { CanvasPropertiesPanel } from "@/components/properties-panel";
import { CanvasHistoryBar } from "@/components/canvas-history-bar";
import { CanvasZoomBar } from "@/components/canvas-zoom-bar";
import { Plugins } from "@/pages/Plugins";
import { Settings } from "@/pages/Settings";
import {
  createInitialCanvasState,
  normalizeWorkflowState,
} from "@/data/canvas-defaults";
import { canvasById, type CanvasRecord } from "@/data/canvases";
import {
  canvasToSnapshot,
  snapshotToCanvas,
  canvasData,
  type CanvasDocumentSummary,
  type ProjectReminder,
  type CanvasSnapshot,
  type SaveCanvasInput,
} from "@/api/canvas-data";
import { mediaData } from "@/api/media-data";
import { toast } from "@productivity-os/shared-ui/hooks/use-toast";
import { reportDataServiceIssue } from "@productivity-os/shared-ui/components/data-service-recovery";
import { workflowNodeExtension } from "@/features/workflow/nodes/canvas-extension";
import {
  WorkflowLinkNode,
  WorkflowMilestoneNode,
  WorkflowTimerNode,
  WorkflowPluginNode,
  WorkflowTaskNode,
  WorkflowTerminatorNode,
  type WorkflowNode,
} from "@/features/workflow/nodes";
import { WorkflowNodeMenu } from "@/components/workflow-node-menu";
import { WORKFLOW_NODE_CATALOG } from "@/features/workflow/nodes/catalog";
import {
  WorkflowNodeTool,
  type RememberedWorkflowNode,
} from "@/components/workflow-node-tool";
import { WorkflowObjectOverlay } from "@/components/workflow-object-overlay";
import { WorkflowNodeActivation } from "@/features/workflow/nodes/task/activation";
import {
  applyWorkflowUpdates,
  workflowCompletionUpdates,
  workflowNodeCanInteract,
} from "@/features/workflow/nodes/progression";
import {
  expiredTimerUpdates,
  normalizeTimerUpdates,
  runningTimerDeadline,
} from "@/features/workflow/nodes/timer/lifecycle";
import { WorkflowSoundController } from "@/features/workflow/controllers/sound-controller";
import { workflowTaskLayout } from "@/features/workflow/nodes/task/layout";
import { canvasDocumentCache } from "@/data/canvas-document-cache";
import { canvasPersistenceQueue } from "@/data/canvas-persistence-queue";
import {
  currentWorkflowObjects,
  dueWorkflowResetUpdates,
  setWorkflowObjectsProvider,
} from "@/features/workflow/nodes/terminator/reset";
import { renderSvgButtonIcon } from "@/features/workflow/nodes/controls/svg-icon";
import { setWorkflowPluginRenderer } from "@/features/workflow/nodes/plugin/render-bridge";
import { setWorkflowPluginResetter } from "@/features/workflow/nodes/plugin/reset-bridge";
import { setWorkflowPluginMigrator } from "@/features/workflow/nodes/plugin/migration-bridge";
import { setWorkflowPluginOutlineRadiusResolver } from "@/features/workflow/nodes/plugin/outline-bridge";
import {
  setWorkflowPluginActionHandler,
  setWorkflowPluginGestureHandler,
  setWorkflowPluginInteractionRegions,
} from "@/features/workflow/nodes/plugin/interaction-bridge";
import {
  workflowPluginDefinition,
  workflowPluginDefinitions,
  workflowPluginPackages,
} from "@/plugins/workflow-plugin-registry";
import { workflowPluginServices } from "@/plugins/workflow-plugin-services";
import {
  useWorkflowPluginInstallations,
  workflowPluginIsInstalled,
} from "@/plugins/workflow-plugin-installations";
import {
  readWorkflowNodeDrag,
  WORKFLOW_NODE_DRAG_TYPE,
} from "@/features/workflow/nodes/drag";

setWorkflowPluginRenderer((target, node, context) => {
  if (!workflowPluginIsInstalled(node.pluginId)) return false;
  const definition = workflowPluginDefinition(
    node.pluginId,
    node.pluginNodeType,
  );
  if (!definition) return false;
  const now = Date.now();
  const disabled = !workflowNodeCanInteract(currentWorkflowObjects(), node.id);
  for (const progress of definition.progressBars ?? [])
    progress.render(target, node, now);
  definition.render(target, node, context, workflowPluginServices);
  for (const waveform of definition.waveforms ?? [])
    waveform.render(target, node, { ...context, disabled });
  for (const button of definition.buttons ?? [])
    button.render(target, node, { ...context, disabled });
  return true;
});

setWorkflowPluginOutlineRadiusResolver((node) => {
  if (!workflowPluginIsInstalled(node.pluginId)) return null;
  const definition = workflowPluginDefinition(
    node.pluginId,
    node.pluginNodeType,
  );
  if (!definition?.outlineRadius) return null;
  return typeof definition.outlineRadius === "function"
    ? definition.outlineRadius(node)
    : definition.outlineRadius;
});

const workflowButtonIconSources = {
  play: new URL("../assets/svg/play-1003-svgrepo-com.svg", import.meta.url)
    .href,
  pause: new URL("../assets/svg/pause-1006-svgrepo-com.svg", import.meta.url)
    .href,
  reset: new URL(
    "../assets/svg/arrow-repeat-235-svgrepo-com.svg",
    import.meta.url,
  ).href,
  plus: new URL("../assets/svg/plus.svg", import.meta.url).href,
  minus: new URL("../assets/svg/minus.svg", import.meta.url).href,
  record: new URL("../assets/svg/circle.svg", import.meta.url).href,
} as const;

setWorkflowNodeButtonIconRenderer((target, state) => {
  if (!(state.icon in workflowButtonIconSources)) return false;
  renderSvgButtonIcon(target, state, workflowButtonIconSources);
  return true;
});

setWorkflowPluginResetter((pluginId, nodeType, data) => {
  const definition = workflowPluginDefinition(pluginId, nodeType);
  return definition?.reset?.(data) ?? { ...data };
});

setWorkflowPluginMigrator((node) => {
  const definition = workflowPluginDefinition(
    node.pluginId,
    node.pluginNodeType,
  );
  if (!definition || node.pluginVersion >= definition.schemaVersion) return;
  const fromVersion = node.pluginVersion;
  node.pluginData = definition.migrate
    ? definition.migrate(node.pluginData, fromVersion)
    : { ...definition.createData(), ...node.pluginData };
  const nodePatch = definition.migrateNode?.(node, fromVersion);
  if (nodePatch) Object.assign(node, nodePatch);
  node.pluginVersion = definition.schemaVersion;
});

setWorkflowPluginInteractionRegions((node) => {
  if (!workflowPluginIsInstalled(node.pluginId)) return [];
  const definition = workflowPluginDefinition(
    node.pluginId,
    node.pluginNodeType,
  );
  if (!definition) return [];
  const disabled = !workflowNodeCanInteract(currentWorkflowObjects(), node.id);
  return [
    ...(definition.buttons ?? [])
      .map((button) => button.interactionRegion(node, { disabled }))
      .filter((region) => region !== null),
    ...(definition.waveforms ?? []).map((waveform) =>
      waveform.interactionRegion(node, { disabled }),
    ),
    ...(definition.pointerInteractionRegions?.(node) ?? []).map((region) =>
      disabled ? { ...region, cursor: "default" } : region,
    ),
  ];
});

type DetailProps = {
  canvasId?: string;
  surfaceKey?: string;
  active?: boolean;
  view?: CanvasSidebarView;
  canvases: readonly CanvasDocumentSummary[];
  starredIds: Set<string>;
  onDelete(canvasId: string): void;
  onTitleChange(canvasId: string, title: string): void;
  onPreviewChange(canvasId: string, previewDataUrl: string): void;
  onNavigate(path: string): void;
  onRegisterCanvasExit(handler: (() => Promise<void>) | null): void;
  onReady?(canvasId: string, surfaceKey?: string): void;
  onLoadError?(canvasId: string, error: unknown, surfaceKey?: string): void;
};

const WORKFLOW_TOOLS: readonly CanvasTool[] = ["select", "hand", "add"];

type NodeMenuState = {
  position: { x: number; y: number };
  worldPoint: { x: number; y: number };
  resolve?: (node: CanvasObject | null) => void;
};

function createNode(
  choice: RememberedWorkflowNode,
  point: { x: number; y: number },
): WorkflowNode {
  const common = {
    id: crypto.randomUUID(),
    layerId: "main",
    type: "workflow-node",
    x: point.x,
    y: point.y,
    rotation: 0,
  };
  const kind = choice.kind;
  const target = choice.kind === "link" ? choice.target : undefined;
  const node =
    kind === "plugin"
      ? (() => {
          const definition = workflowPluginDefinition(
            choice.pluginId,
            choice.nodeType,
          );
          const size = definition?.defaultSize ?? { width: 260, height: 68 };
          return new WorkflowPluginNode({
            ...common,
            name: definition?.title ?? "Plugin node",
            width: size.width,
            height: size.height,
            pluginId: choice.pluginId,
            pluginNodeType: choice.nodeType,
            pluginVersion: definition?.schemaVersion ?? 1,
            pluginData: definition?.createData() ?? {},
            completed: false,
          });
        })()
      : kind === "terminator"
        ? new WorkflowTerminatorNode({
            ...common,
            role: "Start",
            name: "Start",
            width: 96,
            height: 96,
          })
        : kind === "milestone"
          ? new WorkflowMilestoneNode({
              ...common,
              name: "Milestone",
              width: 180,
              height: 88,
            })
          : kind === "timer"
            ? new WorkflowTimerNode({
                ...common,
                name: "Timer",
                width: 260,
                height: 64,
              })
            : kind === "link"
              ? new WorkflowLinkNode({
                  ...common,
                  name: target?.title ?? "Workflow link",
                  targetCanvasId: target?.id ?? "",
                  targetCanvasTitle: target?.title ?? "",
                  width: 260,
                  height: 64,
                })
              : new WorkflowTaskNode({
                  ...common,
                  name: "Task",
                  completed: false,
                  width: 260,
                  height: 64,
                });
  node.x = point.x - node.width / 2;
  node.y = point.y - node.height / 2;
  return node;
}

function projectSubtasksFromTask(task: WorkflowTaskNode) {
  return task.subtasks
    .filter((subtask) => subtask.name.trim().length > 0)
    .map((subtask) => ({
      id: subtask.id,
      title: subtask.name.trim(),
      completed: subtask.completed,
    }));
}

function workflowSubtasksFromReminder(reminder: ProjectReminder) {
  return reminder.subtasks.map((subtask) => ({
    id: subtask.id,
    name: subtask.title,
    completed: subtask.completed,
  }));
}

function sameProjectSubtasks(
  left: ProjectReminder["subtasks"],
  right: ProjectReminder["subtasks"],
): boolean {
  return (
    left.length === right.length &&
    left.every((subtask, index) => {
      const candidate = right[index];
      return (
        candidate?.id === subtask.id &&
        candidate.title === subtask.title &&
        candidate.completed === subtask.completed
      );
    })
  );
}

function reminderTaskPatch(
  task: WorkflowTaskNode,
  reminder: ProjectReminder,
): Partial<WorkflowTaskNode> {
  const patch: Partial<WorkflowTaskNode> = {};
  if (task.name !== reminder.title) patch.name = reminder.title;
  const hasLocalDraft = task.subtasks.some((subtask) => !subtask.name.trim());
  if (!hasLocalDraft) {
    const subtasks = workflowSubtasksFromReminder(reminder);
    if (
      !sameProjectSubtasks(reminder.subtasks, projectSubtasksFromTask(task))
    ) {
      const expandedHeight = Math.max(
        task.expandedHeight,
        workflowTaskLayout.minimumHeightFor(subtasks.length),
      );
      const subtasksCollapsed = subtasks.length > 0 && task.subtasksCollapsed;
      patch.subtasks = subtasks;
      patch.expandedHeight = expandedHeight;
      patch.subtasksCollapsed = subtasksCollapsed;
      patch.height = subtasksCollapsed
        ? workflowTaskLayout.collapsedHeight
        : expandedHeight;
    }
    const completed = reminder.completedAt !== null;
    if (task.completed !== completed) patch.completed = completed;
  }
  return patch;
}

function syncProjectReminderNodes(
  state: EndlessCanvasState,
  reminders: readonly ProjectReminder[],
): boolean {
  const reminderIds = new Set(reminders.map((reminder) => reminder.id));
  const removedNodeIds = new Set(
    state.objects
      .filter((object) => {
        if (object.type !== "workflow-node") return false;
        const task = object as WorkflowTaskNode;
        return (
          task.nodeKind === "task" &&
          Boolean(task.sourceReminderId) &&
          !reminderIds.has(task.sourceReminderId!)
        );
      })
      .map((object) => object.id),
  );
  if (removedNodeIds.size) {
    const retained = state.objects.filter(
      (object) => !removedNodeIds.has(object.id),
    );
    state.objects.splice(0, state.objects.length, ...retained);
    for (const object of state.objects) {
      if (object.type !== "arrow") continue;
      const arrow = object as CanvasObject & {
        start: { binding?: { objectId: string } };
        end: { binding?: { objectId: string } };
      };
      for (const endpoint of [arrow.start, arrow.end]) {
        if (endpoint.binding && removedNodeIds.has(endpoint.binding.objectId))
          endpoint.binding = undefined;
      }
    }
  }
  const existing = new Map<string, WorkflowTaskNode>();
  let changed = removedNodeIds.size > 0;
  for (const object of state.objects) {
    if (object.type !== "workflow-node") continue;
    const candidate = object as WorkflowTaskNode;
    if (candidate.nodeKind !== "task" || !candidate.sourceReminderId) continue;
    if (existing.has(candidate.sourceReminderId)) {
      candidate.sourceReminderId = null;
      changed = true;
    } else {
      existing.set(candidate.sourceReminderId, candidate);
    }
  }
  let nextY =
    state.objects.reduce(
      (maximum, object) => Math.max(maximum, object.y + object.height),
      40,
    ) + 32;
  for (const reminder of reminders) {
    const node = existing.get(reminder.id);
    if (node) {
      const patch = reminderTaskPatch(node, reminder);
      if (Object.keys(patch).length) {
        Object.assign(node, patch);
        changed = true;
      }
      continue;
    }
    const subtasks = workflowSubtasksFromReminder(reminder);
    state.objects.push(
      new WorkflowTaskNode({
        id: `reminder-${reminder.id}`,
        layerId: state.activeLayerId || state.layers?.[0]?.id || "main",
        type: "workflow-node",
        x: 64,
        y: nextY,
        width: 260,
        height: 64,
        rotation: 0,
        name: reminder.title,
        completed: reminder.completedAt !== null,
        subtasks,
        subtasksCollapsed: false,
        sourceReminderId: reminder.id,
      }),
    );
    nextY += 88;
    changed = true;
  }
  return changed;
}

type ProjectReminderState = Pick<
  ProjectReminder,
  "id" | "title" | "completedAt" | "subtasks"
>;

function projectReminderState(reminder: ProjectReminder): ProjectReminderState {
  return {
    id: reminder.id,
    title: reminder.title,
    completedAt: reminder.completedAt,
    subtasks: reminder.subtasks.map((subtask) => ({ ...subtask })),
  };
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target instanceof HTMLButtonElement ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      Boolean(target.closest("[contenteditable='true']")))
  );
}

function playWebTimerCompletionBell(): void {
  const AudioContextClass =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.9);
  gain.connect(context.destination);
  for (const [offset, frequency] of [
    [0, 880],
    [0.18, 1174],
  ] as const) {
    const oscillator = context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(
      frequency,
      context.currentTime + offset,
    );
    oscillator.connect(gain);
    oscillator.start(context.currentTime + offset);
    oscillator.stop(context.currentTime + offset + 0.55);
  }
  window.setTimeout(() => void context.close(), 1_100);
}

function playTimerCompletionBell(): void {
  if ("__TAURI_INTERNALS__" in window || "__TAURI__" in window) {
    void import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke("ring_timer_bell"))
      .catch(() => playWebTimerCompletionBell());
    return;
  }
  playWebTimerCompletionBell();
}

export function Detail({
  canvasId: requestedCanvasId,
  surfaceKey,
  active = true,
  view = "canvas",
  canvases,
  starredIds,
  onDelete,
  onTitleChange,
  onPreviewChange,
  onNavigate,
  onRegisterCanvasExit,
  onReady,
  onLoadError,
}: DetailProps) {
  const { canvasId: routeCanvasId } = useParams();
  const canvasId =
    requestedCanvasId ?? routeCanvasId ?? "workflow-product-launch";
  const [canvasState, setCanvasState] =
    React.useState<EndlessCanvasState | null>(null);
  const [canvas, setCanvas] = React.useState<CanvasRecord>(() =>
    canvasById(canvasId),
  );
  const [sidebarExpanded, setSidebarExpanded] = React.useState(true);
  const [tool, setTool] = React.useState<CanvasTool>("select");
  const [errorMessage, setErrorMessage] = React.useState("");
  const [nodeMenu, setNodeMenu] = React.useState<NodeMenuState | null>(null);
  const [history, setHistory] = React.useState<CanvasHistoryState>({
    canUndo: false,
    canRedo: false,
  });
  const [zoom, setZoom] = React.useState(1);
  const [timerDeadline, setTimerDeadline] = React.useState<number | null>(null);
  const canvasRef = React.useRef<EndlessCanvasHandle>(null);
  const soundEffectsRef = React.useRef<WorkflowSoundController | null>(null);
  if (!soundEffectsRef.current)
    soundEffectsRef.current = new WorkflowSoundController(
      playTimerCompletionBell,
    );
  const captureTimerRef = React.useRef<number | undefined>(undefined);
  const saveTimerRef = React.useRef<number | undefined>(undefined);
  const pendingSnapshotRef = React.useRef<CanvasSnapshot | null>(null);
  const documentRef = React.useRef(canvas);
  const starredRef = React.useRef(starredIds.has(canvasId));
  const autosaveDelayRef = React.useRef(750);
  const closingRef = React.useRef(false);
  const secondaryReadyRef = React.useRef("");
  const projectReminderShadowRef = React.useRef(
    new Map<string, ProjectReminderState>(),
  );
  const projectReminderSaveQueueRef = React.useRef(
    new Map<string, Promise<void>>(),
  );
  const projectTaskCreateQueueRef = React.useRef(
    new Map<string, Promise<void>>(),
  );
  const locallyDeletedProjectRemindersRef = React.useRef(
    new Map<string, ProjectReminderState>(),
  );
  const projectReminderRestorePendingRef = React.useRef(new Set<string>());
  const synchronizingProjectRemindersRef = React.useRef(false);
  const onTitleChangeRef = React.useRef(onTitleChange);
  const onLoadErrorRef = React.useRef(onLoadError);
  onTitleChangeRef.current = onTitleChange;
  onLoadErrorRef.current = onLoadError;
  const rememberedTools = React.useRef<
    Partial<Record<CanvasToolGroupId, CanvasTool>>
  >({ shapes: "rect" });
  const rememberedWorkflowNodeRef = React.useRef<RememberedWorkflowNode>({
    kind: "task",
  });
  const armedDrawerNodeRef = React.useRef<RememberedWorkflowNode | null>(null);
  const [rememberedWorkflowNode, setRememberedWorkflowNode] =
    React.useState<RememberedWorkflowNode>({ kind: "task" });
  const installedPluginIds = useWorkflowPluginInstallations();
  const workflowNodeChoices = React.useMemo<RememberedWorkflowNode[]>(
    () => [
      ...WORKFLOW_NODE_CATALOG.map((item) => ({ kind: item.kind })),
      ...workflowPluginDefinitions(installedPluginIds).map(
        ({ plugin, definition }) => ({
          kind: "plugin" as const,
          pluginId: plugin.manifest.id,
          nodeType: definition.nodeType,
        }),
      ),
    ],
    [installedPluginIds],
  );
  React.useEffect(() => {
    const current = rememberedWorkflowNodeRef.current;
    if (current.kind !== "plugin" || installedPluginIds.has(current.pluginId))
      return;
    const fallback: RememberedWorkflowNode = { kind: "task" };
    rememberedWorkflowNodeRef.current = fallback;
    setRememberedWorkflowNode(fallback);
  }, [installedPluginIds]);
  const enabledTools = WORKFLOW_TOOLS;
  const requestConnectionDrop = React.useCallback(
    (request: CanvasConnectionDropRequest) =>
      new Promise<CanvasObject | null>((resolve) => {
        setNodeMenu({
          position: request.screenPoint,
          worldPoint: request.worldPoint,
          resolve,
        });
      }),
    [],
  );
  const workflowObjects = React.useCallback(
    () => canvasRef.current?.getState()?.objects ?? [],
    [],
  );
  React.useEffect(() => {
    if (!active || view !== "canvas") return undefined;
    setWorkflowObjectsProvider(workflowObjects);
    return () => setWorkflowObjectsProvider(null);
  }, [active, view, workflowObjects]);
  React.useEffect(() => {
    if (!active || view !== "canvas") return undefined;
    const requestRender = () => canvasRef.current?.requestRender();
    window.addEventListener("workflow-node-svg-ready", requestRender);
    window.addEventListener("workflow-plugin-render-request", requestRender);
    return () => {
      window.removeEventListener("workflow-node-svg-ready", requestRender);
      window.removeEventListener(
        "workflow-plugin-render-request",
        requestRender,
      );
    };
  }, [active, view]);
  React.useEffect(() => {
    if (!active || view !== "canvas") return undefined;
    return () => {
      for (const plugin of workflowPluginPackages()) plugin.dispose?.();
    };
  }, [active, canvasId, view]);
  const updateWorkflowObjects = React.useCallback(
    (updates: readonly { objectId: string; patch: Partial<CanvasObject> }[]) =>
      canvasRef.current?.updateObjects(updates) ?? 0,
    [],
  );
  const activateObject = React.useCallback(
    (object: CanvasObject) => {
      new WorkflowNodeActivation(
        workflowObjects,
        updateWorkflowObjects,
      ).activate(object);
    },
    [updateWorkflowObjects, workflowObjects],
  );
  const clickObject = React.useCallback(
    (object: CanvasObject) => {
      if (
        object.type !== "workflow-node" ||
        (object as { nodeKind?: string }).nodeKind !== "plugin"
      )
        return;
      const node = object as WorkflowPluginNode;
      if (!workflowNodeCanInteract(workflowObjects(), node.id)) return;
      if (!workflowPluginIsInstalled(node.pluginId)) return;
      const definition = workflowPluginDefinition(
        node.pluginId,
        node.pluginNodeType,
      );
      if (!definition?.onActivate) return;
      void Promise.resolve(
        definition.onActivate(node, canvasId, workflowPluginServices),
      ).catch((error) =>
        toast({
          title: "Plugin action failed",
          description: error instanceof Error ? error.message : String(error),
        }),
      );
    },
    [canvasId, workflowObjects],
  );
  React.useEffect(() => {
    if (!active || view !== "canvas") return undefined;
    setWorkflowPluginActionHandler((node, regionId, objects) => {
      const disabled = !workflowNodeCanInteract(objects, node.id);
      if (disabled) return;
      if (!workflowPluginIsInstalled(node.pluginId)) return;
      const definition = workflowPluginDefinition(
        node.pluginId,
        node.pluginNodeType,
      );
      const button = definition?.buttons?.find(
        (candidate) => candidate.id === regionId,
      );
      const action = button
        ? button.press(node, regionId, canvasId, workflowPluginServices, {
            disabled,
          })
        : definition?.onInteraction?.(
            node,
            regionId,
            canvasId,
            workflowPluginServices,
          );
      if (!action) return;
      void Promise.resolve(action)
        .then((result) => {
          if (!result) return;
          const current = canvasRef.current?.getState()?.objects;
          if (!current) return;
          const patch = {
            ...(result.nodePatch ?? {}),
            ...(result.pluginData ? { pluginData: result.pluginData } : {}),
          } as Partial<CanvasObject>;
          const updates = result.complete
            ? workflowCompletionUpdates(current, node.id, {
                ...patch,
                completed: true,
              } as Partial<CanvasObject>)
            : [{ objectId: node.id, patch }];
          canvasRef.current?.updateObjects(updates);
        })
        .catch((error) =>
          toast({
            title: "Plugin action failed",
            description: error instanceof Error ? error.message : String(error),
          }),
        );
    });
    setWorkflowPluginGestureHandler((node, regionId, gesture, objects) => {
      if (!workflowNodeCanInteract(objects, node.id)) return false;
      if (!workflowPluginIsInstalled(node.pluginId)) return false;
      return (
        workflowPluginDefinition(
          node.pluginId,
          node.pluginNodeType,
        )?.onPointerGesture?.(
          node,
          regionId,
          gesture,
          canvasId,
          workflowPluginServices,
        ) === true
      );
    });
    return () => {
      setWorkflowPluginActionHandler(null);
      setWorkflowPluginGestureHandler(null);
    };
  }, [active, canvasId, view]);
  const placeWorkflowNode = React.useCallback(
    (point: { x: number; y: number }) => {
      const remembered = rememberedWorkflowNodeRef.current;
      const node = createNode(remembered, point);
      if (node.nodeKind === "plugin") {
        const pluginNode = node as WorkflowPluginNode;
        const definition = workflowPluginDefinition(
          pluginNode.pluginId,
          pluginNode.pluginNodeType,
        );
        void Promise.resolve()
          .then(() =>
            definition?.onCreate?.(
              pluginNode,
              canvasId,
              workflowPluginServices,
            ),
          )
          .catch((error) =>
            toast({
              title: "Plugin setup failed",
              description:
                error instanceof Error ? error.message : String(error),
            }),
          );
      }
      return node;
    },
    [canvasId],
  );
  const drawWorkflowNode = React.useCallback(
    (placement: CanvasDrawnPlacement) => {
      const armed = armedDrawerNodeRef.current;
      armedDrawerNodeRef.current = null;
      if (armed) {
        rememberedWorkflowNodeRef.current = armed;
        return placeWorkflowNode(placement.center);
      }
      const viewport = canvasRef.current?.getState()?.viewport ?? {
        x: 0,
        y: 0,
        scale: 1,
      };
      setNodeMenu({
        position: {
          x: viewport.x + placement.center.x * viewport.scale,
          y: viewport.y + placement.center.y * viewport.scale,
        },
        worldPoint: placement.center,
      });
      return null;
    },
    [placeWorkflowNode],
  );
  const options = React.useMemo<EndlessCanvasOptions>(
    () => ({
      clipboard: createTauriCanvasClipboard(),
      objectCapabilities: { card: { rotatable: false } },
      gridStyle: "dots",
      propertyDefaults: {
        arrow: {
          stroke: 0x9ca3af,
          strokeWidth: 4,
          renderMode: "under",
          startHead: "none",
          endHead: "none",
        },
        line: {
          stroke: 0x9ca3af,
          strokeWidth: 4,
          renderMode: "under",
          startHead: "none",
          endHead: "none",
        },
      },
      objectExtensions: [workflowNodeExtension],
      onConnectionDrop: requestConnectionDrop,
      onAddToolDraw: drawWorkflowNode,
      onObjectCreate: (object) => {
        if (
          documentRef.current.workflowKind !== "project" ||
          object.type !== "workflow-node"
        )
          return;
        const task = object as WorkflowTaskNode;
        if (
          task.nodeKind === "task" &&
          task.sourceReminderId &&
          !projectReminderShadowRef.current.has(task.sourceReminderId)
        )
          task.sourceReminderId = null;
      },
      onObjectClick: clickObject,
      onObjectActivate: activateObject,
      assets: {
        pickImage: () =>
          mediaData.pickCanvasImage(canvasId, documentRef.current.title),
        pickVideo: () =>
          mediaData.pickCanvasVideo(canvasId, documentRef.current.title),
      },
    }),
    [
      activateObject,
      canvasId,
      clickObject,
      drawWorkflowNode,
      requestConnectionDrop,
    ],
  );

  React.useEffect(() => {
    documentRef.current = canvas;
  }, [canvas]);
  React.useEffect(() => {
    starredRef.current = starredIds.has(canvasId);
  }, [starredIds, canvasId]);

  const reportError = React.useCallback((error: unknown) => {
    console.error(error);
    const message =
      error instanceof Error
        ? error.message
        : String(error || "The workflow could not complete that action.");
    setErrorMessage(message);
    toast({ title: "Workflow couldn’t save", description: message });
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    setCanvasState(null);
    pendingSnapshotRef.current = null;
    projectReminderShadowRef.current.clear();
    projectTaskCreateQueueRef.current.clear();
    locallyDeletedProjectRemindersRef.current.clear();
    projectReminderRestorePendingRef.current.clear();
    void (async () => {
      try {
        const cached = canvasDocumentCache.get(canvasId);
        const stored = cached ?? (await canvasData.get(canvasId));
        if (stored && stored.canvasType !== "workflow")
          throw new Error("Workflow not found.");
        if (stored && !cached) canvasDocumentCache.store(stored);
        const fallbackRecord = canvasById(canvasId);
        let state = stored
          ? snapshotToCanvas(stored.canvas)
          : createInitialCanvasState(canvasId);
        const nextCanvas: CanvasRecord = {
          ...fallbackRecord,
          title: stored?.title ?? fallbackRecord.title,
          project: stored?.project ?? fallbackRecord.project,
          canvasType: "workflow",
          workflowKind: stored?.workflowKind ?? fallbackRecord.workflowKind,
          icon: stored?.icon ?? fallbackRecord.icon,
          coverMediaId: stored?.coverMediaId ?? null,
        };
        const projectReminders =
          nextCanvas.workflowKind === "project"
            ? await canvasData.projectReminders(canvasId)
            : [];
        projectReminderShadowRef.current = new Map(
          projectReminders.map((reminder) => [
            reminder.id,
            projectReminderState(reminder),
          ]),
        );
        const projectRemindersChanged =
          nextCanvas.workflowKind === "project"
            ? syncProjectReminderNodes(state, projectReminders)
            : false;
        state = normalizeWorkflowState(state);
        const timerUpdates = normalizeTimerUpdates(state.objects);
        applyWorkflowUpdates(state.objects, timerUpdates);
        if (stored && (timerUpdates.length > 0 || projectRemindersChanged)) {
          const normalizedSnapshot = canvasToSnapshot(state);
          const normalizedInput: SaveCanvasInput = {
            id: canvasId,
            title: nextCanvas.title,
            project: nextCanvas.project,
            canvasType: "workflow",
            workflowKind: nextCanvas.workflowKind,
            icon: nextCanvas.icon,
            starred: starredRef.current,
            coverMediaId: nextCanvas.coverMediaId ?? null,
            expectedRevision: null,
            canvas: normalizedSnapshot,
          };
          canvasDocumentCache.update(normalizedInput, normalizedSnapshot);
          await canvasPersistenceQueue.enqueue(normalizedInput);
        }
        if (!stored) {
          await canvasData.save({
            id: canvasId,
            title: nextCanvas.title,
            project: nextCanvas.project,
            canvasType: "workflow",
            workflowKind: nextCanvas.workflowKind,
            icon: nextCanvas.icon,
            starred: starredRef.current,
            coverMediaId: nextCanvas.coverMediaId ?? null,
            expectedRevision: null,
            canvas: canvasToSnapshot(state),
          });
        }
        if (cancelled) return;
        setCanvas(nextCanvas);
        documentRef.current = nextCanvas;
        onTitleChangeRef.current(canvasId, nextCanvas.title);
        setZoom(Math.min(5, Math.max(0.1, state.viewport?.scale ?? 1)));
        setTimerDeadline(runningTimerDeadline(state.objects));
        soundEffectsRef.current?.prime(state.objects);
        setCanvasState(state);
        const status = await canvasData.status();
        autosaveDelayRef.current =
          status.activeSettings?.canvasAutosaveDebounceMs ??
          status.configuredSettings?.canvasAutosaveDebounceMs ??
          750;
      } catch (error) {
        if (!cancelled) {
          reportError(error);
          onLoadErrorRef.current?.(canvasId, error, surfaceKey);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canvasId, reportError, surfaceKey]);

  const selectTool = React.useCallback((nextTool: CanvasTool) => {
    if (nextTool === "image" || nextTool === "video") {
      setTool("select");
      if (nextTool === "image") canvasRef.current?.insertImage();
      else canvasRef.current?.insertVideo();
      return;
    }
    setTool(nextTool);
    const group = groupForTool(nextTool);
    if (group) rememberedTools.current[group] = nextTool;
  }, []);

  const cycleWorkflowNode = React.useCallback(
    (direction: 1 | -1) => {
      if (!workflowNodeChoices.length) return;
      const current = rememberedWorkflowNodeRef.current;
      const currentIndex = workflowNodeChoices.findIndex((choice) =>
        choice.kind === "plugin" && current.kind === "plugin"
          ? choice.pluginId === current.pluginId &&
            choice.nodeType === current.nodeType
          : choice.kind === current.kind,
      );
      const index = currentIndex < 0 ? 0 : currentIndex;
      const next =
        workflowNodeChoices[
          (index + direction + workflowNodeChoices.length) %
            workflowNodeChoices.length
        ];
      rememberedWorkflowNodeRef.current = next;
      setRememberedWorkflowNode(next);
    },
    [workflowNodeChoices],
  );

  React.useEffect(() => {
    if (!active) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isEditableTarget(event.target)
      )
        return;
      if (
        document.querySelector(
          "[data-slot='dialog-content'], [data-slot='dropdown-menu-content'], [data-slot='context-menu-content']",
        )
      )
        return;
      if (event.key.toLocaleLowerCase() === "n") {
        event.preventDefault();
        if (tool === "add" || event.shiftKey)
          cycleWorkflowNode(event.shiftKey ? -1 : 1);
        selectTool("add");
        return;
      }
      const group = groupForShortcut(event.key, enabledTools);
      if (!group) return;
      event.preventDefault();
      selectTool(
        nextToolForGroup(
          group,
          tool,
          rememberedTools.current[group],
          enabledTools,
          event.shiftKey ? -1 : 1,
        ),
      );
    };
    const handleToolEvent = (event: Event) =>
      selectTool((event as CustomEvent<CanvasTool>).detail);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("workflows:set-canvas-tool", handleToolEvent);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("workflows:set-canvas-tool", handleToolEvent);
    };
  }, [active, cycleWorkflowNode, enabledTools, selectTool, tool]);

  React.useEffect(() => {
    if (!enabledTools.includes(tool)) setTool("select");
  }, [enabledTools, tool]);

  const capturePreview = React.useCallback(async () => {
    try {
      const preview = await canvasRef.current?.captureSnapshot({
        format: "jpeg",
        quality: 0.76,
        resolution: 0.7,
      });
      if (!preview?.startsWith("data:image/jpeg"))
        throw new Error("Workflow preview capture returned an invalid image.");
      await canvasData.savePreview(canvasId, preview);
      onPreviewChange(canvasId, preview);
    } catch (error) {
      reportError(error);
    }
  }, [onPreviewChange, reportError, canvasId]);

  const persistNow = React.useCallback(async () => {
    if (saveTimerRef.current !== undefined) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = undefined;
    }
    const snapshot =
      pendingSnapshotRef.current ??
      (canvasRef.current?.getState()
        ? canvasToSnapshot(canvasRef.current.getState()!)
        : null);
    if (!snapshot) return;
    pendingSnapshotRef.current = null;
    const currentCanvas = documentRef.current;
    const input: SaveCanvasInput = {
      id: canvasId,
      title: currentCanvas.title,
      project: currentCanvas.project,
      canvasType: currentCanvas.canvasType,
      workflowKind: currentCanvas.workflowKind,
      icon: currentCanvas.icon,
      starred: starredRef.current,
      coverMediaId: currentCanvas.coverMediaId ?? null,
      expectedRevision: null,
      canvas: snapshot,
    };
    canvasDocumentCache.update(input, snapshot);
    await canvasPersistenceQueue.enqueue(input);
  }, [canvasId]);

  const flushCanvas = React.useCallback(async () => {
    await Promise.all([persistNow(), capturePreview()]);
  }, [capturePreview, persistNow]);

  React.useEffect(() => {
    if (!active || view !== "canvas") return undefined;
    const save = (event: KeyboardEvent) => {
      if (
        !(event.metaKey || event.ctrlKey) ||
        event.altKey ||
        event.shiftKey ||
        event.key.toLocaleLowerCase() !== "s"
      )
        return;
      event.preventDefault();
      void flushCanvas()
        .then(() =>
          toast({
            title: "Workflow saved",
            description: "A fresh snapshot was captured.",
          }),
        )
        .catch(reportError);
    };
    window.addEventListener("keydown", save);
    return () => window.removeEventListener("keydown", save);
  }, [active, flushCanvas, reportError, view]);

  React.useEffect(() => {
    if (
      !active ||
      view !== "canvas" ||
      !("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
    )
      return undefined;
    let unlisten: (() => void) | undefined;
    void import("@tauri-apps/api/event")
      .then(({ listen }) =>
        listen("workflows:native-save-workflow", () => {
          void flushCanvas()
            .then(() =>
              toast({
                title: "Workflow saved",
                description: "A fresh snapshot was captured.",
              }),
            )
            .catch(reportError);
        }),
      )
      .then((cleanup) => {
        unlisten = cleanup;
      });
    return () => unlisten?.();
  }, [active, flushCanvas, reportError, view]);

  React.useEffect(() => {
    if (!active || view !== "canvas" || !canvasState) return undefined;
    onRegisterCanvasExit(persistNow);
    return () => onRegisterCanvasExit(null);
  }, [active, canvasState, onRegisterCanvasExit, persistNow, view]);

  const reconcileProjectTasks = React.useCallback(
    (state: EndlessCanvasState) => {
      if (
        documentRef.current.workflowKind !== "project" ||
        synchronizingProjectRemindersRef.current
      )
        return;
      const tasks = state.objects.filter(
        (object): object is WorkflowTaskNode =>
          object.type === "workflow-node" &&
          (object as WorkflowTaskNode).nodeKind === "task",
      );
      const linkedReminderIds = new Set<string>();
      for (const task of tasks) {
        if (!task.sourceReminderId) continue;
        if (linkedReminderIds.has(task.sourceReminderId))
          task.sourceReminderId = null;
        else linkedReminderIds.add(task.sourceReminderId);
      }

      for (const [reminderId, previous] of projectReminderShadowRef.current) {
        if (linkedReminderIds.has(reminderId)) continue;
        projectReminderShadowRef.current.delete(reminderId);
        locallyDeletedProjectRemindersRef.current.set(reminderId, previous);
        const priorRequest =
          projectReminderSaveQueueRef.current.get(reminderId) ??
          Promise.resolve();
        const request = priorRequest
          .catch(() => undefined)
          .then(() => canvasData.deleteProjectReminder(canvasId, reminderId))
          .then(() => undefined)
          .catch((error) => {
            if (!linkedReminderIds.has(reminderId)) {
              locallyDeletedProjectRemindersRef.current.delete(reminderId);
              projectReminderShadowRef.current.set(reminderId, previous);
            }
            reportDataServiceIssue(error);
          })
          .finally(() => {
            if (projectReminderSaveQueueRef.current.get(reminderId) === request)
              projectReminderSaveQueueRef.current.delete(reminderId);
          });
        projectReminderSaveQueueRef.current.set(reminderId, request);
      }

      for (const task of tasks) {
        if (!task.sourceReminderId) {
          if (projectTaskCreateQueueRef.current.has(task.id)) continue;
          const title = task.name.trim() || "Task";
          const subtasks = projectSubtasksFromTask(task);
          const request = canvasData
            .createProjectReminder({
              projectId: canvasId,
              title,
              completed: task.completed,
              subtasks,
            })
            .then(async (saved) => {
              const handle = canvasRef.current;
              const current = handle
                ?.getState()
                ?.objects.find(
                  (object): object is WorkflowTaskNode =>
                    object.id === task.id &&
                    object.type === "workflow-node" &&
                    (object as WorkflowTaskNode).nodeKind === "task",
                );
              if (!handle || !current || current.sourceReminderId) {
                await canvasData.deleteProjectReminder(canvasId, saved.id);
                return;
              }
              projectReminderShadowRef.current.set(
                saved.id,
                projectReminderState(saved),
              );
              handle.updateObject(current.id, {
                sourceReminderId: saved.id,
              } as Partial<CanvasObject>);
            })
            .catch((error) => {
              reportDataServiceIssue(error);
            })
            .finally(() => projectTaskCreateQueueRef.current.delete(task.id));
          projectTaskCreateQueueRef.current.set(task.id, request);
          continue;
        }

        const reminderId = task.sourceReminderId;
        if (task.subtasks.some((subtask) => !subtask.name.trim())) continue;
        const deleted =
          locallyDeletedProjectRemindersRef.current.get(reminderId);
        if (
          deleted &&
          !projectReminderRestorePendingRef.current.has(reminderId)
        ) {
          projectReminderRestorePendingRef.current.add(reminderId);
          const title = task.name.trim() || deleted.title;
          const subtasks = projectSubtasksFromTask(task);
          const priorRequest =
            projectReminderSaveQueueRef.current.get(reminderId) ??
            Promise.resolve();
          const request = priorRequest
            .catch(() => undefined)
            .then(() =>
              canvasData.restoreProjectReminder({
                projectId: canvasId,
                id: reminderId,
                title,
                completed: task.completed,
                subtasks,
              }),
            )
            .then(async (saved) => {
              const current = canvasRef.current
                ?.getState()
                ?.objects.find((object) => object.id === task.id);
              if (!saved) {
                if (current)
                  canvasRef.current?.updateObject(task.id, {
                    sourceReminderId: null,
                  } as Partial<CanvasObject>);
                return;
              }
              if (!current) {
                await canvasData.deleteProjectReminder(canvasId, saved.id);
                return;
              }
              locallyDeletedProjectRemindersRef.current.delete(reminderId);
              projectReminderShadowRef.current.set(
                saved.id,
                projectReminderState(saved),
              );
            })
            .catch((error) => {
              reportDataServiceIssue(error);
            })
            .finally(() => {
              projectReminderRestorePendingRef.current.delete(reminderId);
              if (
                projectReminderSaveQueueRef.current.get(reminderId) === request
              )
                projectReminderSaveQueueRef.current.delete(reminderId);
            });
          projectReminderSaveQueueRef.current.set(reminderId, request);
          continue;
        }

        const previous = projectReminderShadowRef.current.get(reminderId);
        if (!previous) continue;
        const title = task.name.trim() || previous.title;
        const completed = task.completed;
        const subtasks = projectSubtasksFromTask(task);
        if (
          previous.title === title &&
          (previous.completedAt !== null) === completed &&
          sameProjectSubtasks(previous.subtasks, subtasks)
        )
          continue;
        const optimistic: ProjectReminderState = {
          id: reminderId,
          title,
          completedAt: completed ? Date.now() : null,
          subtasks: subtasks.map((subtask) => ({ ...subtask })),
        };
        projectReminderShadowRef.current.set(reminderId, optimistic);
        const priorRequest =
          projectReminderSaveQueueRef.current.get(reminderId) ??
          Promise.resolve();
        const request = priorRequest
          .catch(() => undefined)
          .then(async () => {
            const saved = await canvasData.updateProjectReminder({
              projectId: canvasId,
              id: reminderId,
              title,
              completed,
              subtasks,
            });
            if (!saved) return;
            const current = projectReminderShadowRef.current.get(saved.id);
            if (
              current?.title === title &&
              (current.completedAt !== null) === (saved.completedAt !== null) &&
              sameProjectSubtasks(current.subtasks, saved.subtasks)
            )
              projectReminderShadowRef.current.set(
                saved.id,
                projectReminderState(saved),
              );
          })
          .catch((error) => {
            const current = projectReminderShadowRef.current.get(reminderId);
            if (current === optimistic)
              projectReminderShadowRef.current.set(reminderId, previous);
            reportDataServiceIssue(error);
          })
          .finally(() => {
            if (projectReminderSaveQueueRef.current.get(reminderId) === request)
              projectReminderSaveQueueRef.current.delete(reminderId);
          });
        projectReminderSaveQueueRef.current.set(reminderId, request);
      }
    },
    [canvasId],
  );

  const schedulePersistence = React.useCallback(
    (state: EndlessCanvasState) => {
      soundEffectsRef.current?.observeMutation(state.objects);
      reconcileProjectTasks(state);
      setTimerDeadline(runningTimerDeadline(state.objects));
      pendingSnapshotRef.current = canvasToSnapshot(state);
      if (saveTimerRef.current !== undefined)
        window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = undefined;
        void persistNow().catch(reportError);
      }, autosaveDelayRef.current);
      if (captureTimerRef.current !== undefined)
        window.clearTimeout(captureTimerRef.current);
      captureTimerRef.current = window.setTimeout(() => {
        captureTimerRef.current = undefined;
        void capturePreview();
      }, 900);
    },
    [capturePreview, persistNow, reconcileProjectTasks, reportError],
  );

  React.useEffect(() => {
    if (
      !active ||
      view !== "canvas" ||
      !canvasState ||
      canvas.workflowKind !== "project"
    )
      return undefined;
    const frame = window.requestAnimationFrame(() => {
      const state = canvasRef.current?.getState();
      if (state) reconcileProjectTasks(state);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [active, canvas.workflowKind, canvasState, reconcileProjectTasks, view]);

  React.useEffect(() => {
    if (
      !active ||
      view !== "canvas" ||
      !canvasState ||
      canvas.workflowKind !== "project"
    )
      return undefined;
    let cancelled = false;
    const refresh = async () => {
      try {
        const fetchedReminders = await canvasData.projectReminders(canvasId);
        if (cancelled) return;
        const handle = canvasRef.current;
        const state = handle?.getState();
        if (!handle || !state) return;
        const reminders = fetchedReminders.filter((reminder) => {
          if (!locallyDeletedProjectRemindersRef.current.has(reminder.id))
            return true;
          if (projectReminderSaveQueueRef.current.has(reminder.id))
            return false;
          locallyDeletedProjectRemindersRef.current.delete(reminder.id);
          return true;
        });
        const nextShadow = new Map(
          reminders.map((reminder) => [
            reminder.id,
            projectReminderState(reminder),
          ]),
        );
        for (const reminderId of projectReminderSaveQueueRef.current.keys()) {
          const optimistic = projectReminderShadowRef.current.get(reminderId);
          if (optimistic) nextShadow.set(reminderId, optimistic);
        }
        const existing = new Map<string, WorkflowTaskNode>();
        for (const object of state.objects) {
          if (object.type !== "workflow-node") continue;
          const task = object as WorkflowTaskNode;
          if (task.nodeKind === "task" && task.sourceReminderId)
            existing.set(task.sourceReminderId, task);
        }
        const remotelyRemovedNodeIds = [...existing]
          .filter(
            ([reminderId]) =>
              !nextShadow.has(reminderId) &&
              !locallyDeletedProjectRemindersRef.current.has(reminderId),
          )
          .map(([, task]) => task.id);
        synchronizingProjectRemindersRef.current = true;
        try {
          projectReminderShadowRef.current = nextShadow;
          if (remotelyRemovedNodeIds.length)
            handle.removeObjects(remotelyRemovedNodeIds);
          const updates: Array<{
            objectId: string;
            patch: Partial<CanvasObject>;
          }> = [];
          let nextY =
            state.objects.reduce(
              (maximum, object) => Math.max(maximum, object.y + object.height),
              40,
            ) + 32;
          for (const reminder of reminders) {
            if (projectReminderSaveQueueRef.current.has(reminder.id)) continue;
            const node = existing.get(reminder.id);
            const completed = reminder.completedAt !== null;
            if (!node) {
              const subtasks = workflowSubtasksFromReminder(reminder);
              handle.insertObject(
                new WorkflowTaskNode({
                  id: `reminder-${reminder.id}`,
                  layerId:
                    state.activeLayerId || state.layers?.[0]?.id || "main",
                  type: "workflow-node",
                  x: 64,
                  y: nextY,
                  width: 260,
                  height: 64,
                  rotation: 0,
                  name: reminder.title,
                  completed,
                  subtasks,
                  subtasksCollapsed: false,
                  sourceReminderId: reminder.id,
                }),
                false,
              );
              nextY += 88;
              continue;
            }
            const patch = reminderTaskPatch(node, reminder);
            if (Object.keys(patch).length)
              updates.push({
                objectId: node.id,
                patch: patch as Partial<CanvasObject>,
              });
          }
          if (updates.length) handle.updateObjects(updates);
        } finally {
          synchronizingProjectRemindersRef.current = false;
        }
        reconcileProjectTasks(state);
      } catch (error) {
        reportDataServiceIssue(error);
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 3_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [
    active,
    canvas.workflowKind,
    canvasId,
    canvasState,
    reconcileProjectTasks,
    view,
  ]);

  React.useEffect(() => {
    if (!active || view !== "canvas" || !canvasState || timerDeadline === null)
      return undefined;
    const refresh = () => {
      const handle = canvasRef.current;
      const state = handle?.getState();
      if (!handle || !state) return;
      const updates = expiredTimerUpdates(state.objects);
      if (updates.length > 0) {
        handle.updateObjects(updates);
      } else {
        soundEffectsRef.current?.tick(state.objects);
        handle.requestRender();
      }
    };
    refresh();
    const interval = window.setInterval(refresh, 250);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [active, canvasState, timerDeadline, view]);

  React.useEffect(() => {
    if (!active || view !== "canvas" || !canvasState) return undefined;
    const tickPlugins = () => {
      const handle = canvasRef.current;
      const state = handle?.getState();
      if (!handle || !state) return;
      const merged = new Map<string, Partial<CanvasObject>>();
      let needsRender = false;
      for (const object of state.objects) {
        if (
          object.type !== "workflow-node" ||
          (object as { nodeKind?: string }).nodeKind !== "plugin"
        )
          continue;
        const node = object as WorkflowPluginNode;
        const definition = workflowPluginDefinition(
          node.pluginId,
          node.pluginNodeType,
        );
        if (!definition?.onTick) continue;
        needsRender ||= node.pluginData.status === "running";
        const result = definition.onTick(
          node,
          Date.now(),
          canvasId,
          workflowPluginServices,
        );
        if (!result) continue;
        const patch = {
          ...(result.nodePatch ?? {}),
          ...(result.pluginData ? { pluginData: result.pluginData } : {}),
        } as Partial<CanvasObject>;
        const nodeUpdates = result.complete
          ? workflowCompletionUpdates(state.objects, node.id, {
              ...patch,
              completed: true,
            } as Partial<CanvasObject>)
          : [{ objectId: node.id, patch }];
        for (const update of nodeUpdates)
          merged.set(update.objectId, {
            ...(merged.get(update.objectId) ?? {}),
            ...update.patch,
          });
      }
      if (merged.size)
        handle.updateObjects(
          [...merged].map(([objectId, patch]) => ({ objectId, patch })),
        );
      else if (needsRender) handle.requestRender();
    };
    tickPlugins();
    const interval = window.setInterval(tickPlugins, 250);
    return () => window.clearInterval(interval);
  }, [active, canvasId, canvasState, view]);

  React.useEffect(() => {
    if (!active || view !== "canvas" || !canvasState) return undefined;
    const resetDueBranches = () => {
      const state = canvasRef.current?.getState();
      if (!state) return;
      const updates = dueWorkflowResetUpdates(state.objects);
      if (updates.length) canvasRef.current?.updateObjects(updates);
    };
    resetDueBranches();
    const interval = window.setInterval(resetDueBranches, 30_000);
    return () => window.clearInterval(interval);
  }, [active, canvasState, view]);

  React.useEffect(() => {
    if (!active || view !== "canvas" || !canvasState) return undefined;
    let cancelled = false;
    const refreshPluginData = async () => {
      try {
        if (installedPluginIds.has("workflows.book-nodes")) {
          await workflowPluginServices.listBooks();
          if (!cancelled) canvasRef.current?.requestRender();
        }
        const recordings = installedPluginIds.has("workflows.quran-nodes")
          ? await workflowPluginServices.listQuranRecordings(canvasId)
          : [];
        const date = new Date();
        const localDate = [
          date.getFullYear(),
          String(date.getMonth() + 1).padStart(2, "0"),
          String(date.getDate()).padStart(2, "0"),
        ].join("-");
        const nutritionWater = installedPluginIds.has("workflows.health-nodes")
          ? await workflowPluginServices.nutritionWaterDay(localDate)
          : null;
        if (cancelled) return;
        const state = canvasRef.current?.getState();
        if (!state) return;
        const updates = new Map<string, Partial<CanvasObject>>();
        for (const object of state.objects) {
          if (
            object.type !== "workflow-node" ||
            (object as { nodeKind?: string }).nodeKind !== "plugin"
          )
            continue;
          const node = object as WorkflowPluginNode;
          if (
            node.pluginId === "workflows.health-nodes" &&
            node.pluginNodeType === "water" &&
            nutritionWater
          ) {
            if (node.pluginData.updatedAt !== nutritionWater.updatedAt) {
              const pluginData = { ...node.pluginData, ...nutritionWater };
              updates.set(node.id, { pluginData } as Partial<CanvasObject>);
            }
            continue;
          }
          if (
            node.pluginId === "workflows.quran-nodes" &&
            node.pluginNodeType === "quran-revision"
          ) {
            const attempts = recordings.filter(
              (recording) => recording.nodeId === node.id,
            );
            const pendingRecordingId =
              typeof node.pluginData.pendingRecordingId === "string"
                ? node.pluginData.pendingRecordingId
                : null;
            const currentRecordingId =
              typeof node.pluginData.recordingId === "string"
                ? node.pluginData.recordingId
                : typeof node.pluginData.lastProcessedRecordingId === "string"
                  ? node.pluginData.lastProcessedRecordingId
                  : null;
            const targetId = pendingRecordingId ?? currentRecordingId;
            if (!targetId) continue;
            const latest = attempts.find(
              (recording) => recording.id === targetId,
            );
            if (!latest) continue;
            const pendingAfterUpdatedAt =
              Number(node.pluginData.pendingAfterUpdatedAt) || 0;
            if (pendingRecordingId && latest.updatedAt <= pendingAfterUpdatedAt)
              continue;
            if (
              !pendingRecordingId &&
              Number(node.pluginData.recordingUpdatedAt) === latest.updatedAt
            )
              continue;
            const pluginData = {
              ...node.pluginData,
              latestDurationMs: latest.durationMs,
              attemptCount: attempts.length,
              recordingId: latest.id,
              recordingUpdatedAt: latest.updatedAt,
              pendingRecordingId:
                latest.status === "completed" ? null : pendingRecordingId,
              captureSessionId:
                latest.status === "completed"
                  ? null
                  : node.pluginData.captureSessionId,
              pendingAfterUpdatedAt: 0,
            };
            const nodeUpdates =
              node.completed || latest.status !== "completed"
                ? [
                    {
                      objectId: node.id,
                      patch: { pluginData } as Partial<CanvasObject>,
                    },
                  ]
                : workflowCompletionUpdates(state.objects, node.id, {
                    pluginData,
                    completed: true,
                  } as Partial<CanvasObject>);
            for (const update of nodeUpdates)
              updates.set(update.objectId, {
                ...(updates.get(update.objectId) ?? {}),
                ...update.patch,
              });
            continue;
          }
          if (
            node.pluginId === "workflows.revise-nodes" &&
            node.pluginNodeType === "timed-revision"
          ) {
            const sessionId =
              typeof node.pluginData.sessionId === "string"
                ? node.pluginData.sessionId
                : "";
            if (!sessionId) continue;
            const session =
              await workflowPluginServices.revisionSession(sessionId);
            if (
              !session ||
              cancelled ||
              session.updatedAt === node.pluginData.sessionUpdatedAt
            )
              continue;
            const pluginData = {
              ...node.pluginData,
              status: session.status,
              elapsedMs: session.elapsedMs,
              startedAt: session.startedAt,
              totalCards: session.totalCards,
              remainingCards: session.remainingCards,
              reviewedCount: session.reviewedCount,
              rightCount: session.rightCount,
              wrongCount: session.wrongCount,
              results: session.results,
              sessionUpdatedAt: session.updatedAt,
            };
            const completes = session.status === "completed" && !node.completed;
            const nodeUpdates = completes
              ? workflowCompletionUpdates(state.objects, node.id, {
                  pluginData,
                  completed: true,
                } as Partial<CanvasObject>)
              : [
                  {
                    objectId: node.id,
                    patch: { pluginData } as Partial<CanvasObject>,
                  },
                ];
            for (const update of nodeUpdates)
              updates.set(update.objectId, {
                ...(updates.get(update.objectId) ?? {}),
                ...update.patch,
              });
          }
        }
        if (updates.size)
          canvasRef.current?.updateObjects(
            [...updates].map(([objectId, patch]) => ({ objectId, patch })),
          );
      } catch (error) {
        console.warn("Workflow plugin refresh failed", error);
      }
    };
    void refreshPluginData();
    const interval = window.setInterval(() => void refreshPluginData(), 1_000);
    const onFocus = () => void refreshPluginData();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [active, canvasId, canvasState, installedPluginIds, view]);

  React.useEffect(() => {
    if (!active || view !== "canvas" || !canvasState) return undefined;
    const timer = window.setTimeout(() => void capturePreview(), 450);
    return () => {
      window.clearTimeout(timer);
      if (captureTimerRef.current !== undefined)
        window.clearTimeout(captureTimerRef.current);
    };
  }, [active, canvasState, capturePreview, view]);

  React.useEffect(
    () => () => {
      if (saveTimerRef.current !== undefined)
        window.clearTimeout(saveTimerRef.current);
      void persistNow().catch(reportError);
    },
    [persistNow, reportError],
  );

  React.useEffect(() => {
    const isTauriRuntime =
      "__TAURI_INTERNALS__" in window || "__TAURI__" in window;
    if (!active || !isTauriRuntime) return undefined;
    let unlisten: (() => void) | undefined;
    void import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) =>
        getCurrentWindow().onCloseRequested(async (event) => {
          if (closingRef.current) return;
          event.preventDefault();
          try {
            await flushCanvas();
          } catch (error) {
            reportError(error);
          }
          closingRef.current = true;
          await getCurrentWindow().destroy();
        }),
      )
      .then((cleanup) => {
        unlisten = cleanup;
      });
    return () => unlisten?.();
  }, [active, flushCanvas, reportError]);

  const changeZoom = React.useCallback((nextZoom: number) => {
    setZoom(canvasRef.current?.setZoom(nextZoom) ?? nextZoom);
  }, []);
  const handleViewportChange = React.useCallback(
    (viewport: EndlessCanvasState["viewport"]) => {
      setZoom(viewport?.scale ?? 1);
    },
    [],
  );

  const renameCanvas = React.useCallback(
    (title: string) => {
      const next = { ...documentRef.current, title };
      documentRef.current = next;
      setCanvas(next);
      onTitleChange(canvasId, title);
      void canvasData.setTitle(canvasId, title).catch(reportError);
    },
    [onTitleChange, reportError, canvasId],
  );

  const workflowDestinations = React.useMemo(
    () =>
      canvases
        .filter(
          (candidate) =>
            candidate.canvasType === "workflow" && candidate.id !== canvasId,
        )
        .map(({ id, title }) => ({ id, title })),
    [canvases, canvasId],
  );
  const propertiesSlot = React.useCallback(
    (props: CanvasPropertiesSlotProps) => (
      <CanvasPropertiesPanel
        {...props}
        workflowMode
        workflowDestinations={workflowDestinations}
        getWorkflowObjects={workflowObjects}
        workflowId={canvasId}
        installedPluginIds={installedPluginIds}
      />
    ),
    [canvasId, installedPluginIds, workflowDestinations, workflowObjects],
  );
  const canvasPath = `/workflow/${canvasId}`;
  const persistAndNavigate = React.useCallback(
    (path: string) => {
      onNavigate(path);
    },
    [onNavigate],
  );
  const objectOverlaySlot = React.useCallback(
    (props: CanvasObjectOverlaySlotProps) => (
      <WorkflowObjectOverlay {...props} />
    ),
    [],
  );
  const closeNodeMenu = React.useCallback(() => {
    setNodeMenu((current) => {
      current?.resolve?.(null);
      return null;
    });
  }, []);
  const chooseNode = React.useCallback((choice: RememberedWorkflowNode) => {
    rememberedWorkflowNodeRef.current = choice;
    setRememberedWorkflowNode(choice);
    setNodeMenu((current) => {
      if (!current) return null;
      const node = createNode(choice, current.worldPoint);
      if (current.resolve) current.resolve(node);
      else canvasRef.current?.insertObject(node);
      return null;
    });
  }, []);
  const chooseToolbarNode = React.useCallback(
    (choice: RememberedWorkflowNode) => {
      rememberedWorkflowNodeRef.current = choice;
      setRememberedWorkflowNode(choice);
      selectTool("add");
    },
    [selectTool],
  );
  const dropDrawerNode = React.useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      const choice = readWorkflowNodeDrag(event.dataTransfer);
      if (!choice) return;
      event.preventDefault();
      const bounds = event.currentTarget.getBoundingClientRect();
      const viewport = canvasRef.current?.getState()?.viewport ?? {
        x: 0,
        y: 0,
        scale: 1,
      };
      const point = {
        x: (event.clientX - bounds.left - viewport.x) / viewport.scale,
        y: (event.clientY - bounds.top - viewport.y) / viewport.scale,
      };
      rememberedWorkflowNodeRef.current = choice;
      setRememberedWorkflowNode(choice);
      const node = placeWorkflowNode(point);
      canvasRef.current?.insertObject(node, true);
      selectTool("select");
    },
    [placeWorkflowNode, selectTool],
  );

  React.useEffect(() => {
    if (!canvasState) return;
    const sourceObjectId = window.sessionStorage.getItem(
      "canvas:source-object",
    );
    if (!sourceObjectId) return;
    const frame = window.requestAnimationFrame(() => {
      if (canvasRef.current?.focusObject(sourceObjectId))
        window.sessionStorage.removeItem("canvas:source-object");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [canvasId, canvasState]);

  React.useEffect(() => {
    const signature =
      canvasState && view !== "canvas" ? `${canvasId}:${view}` : "";
    if (!signature || secondaryReadyRef.current === signature) return;
    secondaryReadyRef.current = signature;
    onReady?.(canvasId, surfaceKey);
  }, [canvasId, canvasState, onReady, surfaceKey, view]);

  if (!canvasState) {
    return <div className="canvas-canvas-loading">Loading workflow…</div>;
  }

  if (view === "plugins") {
    return (
      <div className="canvas-detail-shell canvas-plugins-fullpage">
        <Plugins onBack={() => persistAndNavigate(canvasPath)} />
      </div>
    );
  }

  return (
    <SidebarProvider
      open={sidebarExpanded}
      onOpenChange={setSidebarExpanded}
      className="canvas-detail-shell"
    >
      <CanvasSidebar
        canvas={canvas}
        view={view}
        expanded={sidebarExpanded}
        onExpandedChange={setSidebarExpanded}
        onNavigateCanvas={() => persistAndNavigate(canvasPath)}
        onNavigatePlugins={() => persistAndNavigate(`${canvasPath}/plugins`)}
        onRename={renameCanvas}
        onDelete={() => onDelete(canvasId)}
        onChooseNode={(choice) => {
          rememberedWorkflowNodeRef.current = choice;
          armedDrawerNodeRef.current = choice;
          setRememberedWorkflowNode(choice);
          selectTool("add");
        }}
      />

      {view === "canvas" ? (
        <CanvasSurfaceContextMenu
          canvasRef={canvasRef}
          onOpenMedia={(mediaId) => mediaData.open(mediaId)}
          onError={reportError}
        >
          <div
            className="canvas-context-target"
            onDragOver={(event) => {
              if (!event.dataTransfer.types.includes(WORKFLOW_NODE_DRAG_TYPE))
                return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
            }}
            onDrop={dropDrawerNode}
          >
            <SidebarInset className="canvas-detail-main">
              <EndlessCanvas
                ref={canvasRef}
                className="canvas-endless-canvas"
                style={{ width: "100%", height: "100%" }}
                initialState={canvasState}
                tool={tool}
                options={options}
                onChange={schedulePersistence}
                onError={reportError}
                onToolChangeRequest={selectTool}
                onHistoryChange={setHistory}
                onViewportChange={handleViewportChange}
                onReady={() => onReady?.(canvasId, surfaceKey)}
                propertiesSlot={propertiesSlot}
                objectOverlaySlot={objectOverlaySlot}
              />
              <CanvasToolbar
                tool={tool}
                onToolChange={selectTool}
                enabledTools={enabledTools}
                addTool={
                  <WorkflowNodeTool
                    active={tool === "add"}
                    onActivate={() => {
                      armedDrawerNodeRef.current = null;
                      chooseToolbarNode(rememberedWorkflowNode);
                    }}
                  />
                }
              />
              <div className="canvas-bottom-controls">
                <CanvasZoomBar zoom={zoom} onZoomChange={changeZoom} />
                <CanvasHistoryBar
                  canUndo={history.canUndo}
                  canRedo={history.canRedo}
                  onUndo={() => canvasRef.current?.undo()}
                  onRedo={() => canvasRef.current?.redo()}
                />
              </div>
              {nodeMenu && (
                <WorkflowNodeMenu
                  position={nodeMenu.position}
                  canvases={canvases}
                  currentCanvasId={canvasId}
                  onChoose={chooseNode}
                  onCancel={closeNodeMenu}
                />
              )}
              {errorMessage && (
                <div className="canvas-error-message" role="alert">
                  <span>{errorMessage}</span>
                  <button type="button" onClick={() => setErrorMessage("")}>
                    Dismiss
                  </button>
                </div>
              )}
            </SidebarInset>
          </div>
        </CanvasSurfaceContextMenu>
      ) : (
        <SidebarInset className="canvas-detail-main canvas-secondary-page">
          <Settings />
        </SidebarInset>
      )}
    </SidebarProvider>
  );
}
