import { invoke } from "@tauri-apps/api/core";
import type { CanvasLayer, CanvasObject, EndlessCanvasState } from "@productivity-os/canvas";

export type ServiceSettings = {
  protocolVersion: number;
  configVersion: number;
  socketPath: string;
  databasePath: string;
  mediaPath: string;
  maxRequestBytes: number;
  maxConnections: number;
  busyTimeoutMs: number;
  canvasAutosaveDebounceMs: number;
  canvasSeedDemoData: boolean;
};

export type DataServiceStatus = {
  connected: boolean;
  configuredSettings: ServiceSettings | null;
  activeSettings: ServiceSettings | null;
  error: string | null;
};

export type CanvasType = "base" | "log" | "workflow";
export type WorkflowDocumentKind = "workflow" | "project";
export type ProjectReminderSubtask = {
  id: string;
  title: string;
  completed: boolean;
};
export type ProjectReminder = {
  id: string;
  title: string;
  notes: string;
  subtasks: ProjectReminderSubtask[];
  completedAt: number | null;
  sortIndex: number;
};

export type ProjectReminderUpdate = {
  projectId: string;
  id: string;
  title: string;
  completed: boolean;
  subtasks: ProjectReminderSubtask[];
};

export type ProjectReminderCreate = Omit<ProjectReminderUpdate, "id">;

export type CanvasDocumentSummary = {
  id: string;
  title: string;
  project: string;
  canvasType: CanvasType;
  workflowKind: WorkflowDocumentKind;
  icon: string;
  starred: boolean;
  createdAt: number;
  updatedAt: number;
  revision: number;
  previewDataUrl: string | null;
  coverMediaId: string | null;
};

export type CanvasSnapshot = {
  schemaVersion: number;
  activeLayerId: string;
  focusedLayerId: string | null;
  unfocusedLayerOpacity: number;
  viewport: { x: number; y: number; scale: number };
  layers: Array<{
    id: string;
    name: string;
    zIndex: number;
    visible: boolean;
    opacity: number;
    interactionColor: number;
  }>;
  objects: Array<{
    id: string;
    layerId: string;
    objectType: string;
    sortIndex: number;
    payload: Record<string, unknown>;
  }>;
};

export type CanvasDocument = CanvasDocumentSummary & { canvas: CanvasSnapshot };
export type SaveCanvasInput = {
  id: string;
  title: string;
  project: string;
  canvasType: CanvasType;
  workflowKind: WorkflowDocumentKind;
  icon: string;
  starred: boolean;
  coverMediaId: string | null;
  expectedRevision: number | null;
  canvas: CanvasSnapshot;
};

export const isTauriRuntime = typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
const memoryDocuments = new Map<string, CanvasDocument>();
const memoryProjectReminders = new Map<string, ProjectReminder[]>();
const memoryDeletedProjectReminders = new Map<string, { projectId: string; reminder: ProjectReminder }>();
let memorySeeded = false;

const now = () => Date.now();
const clone = <T,>(value: T): T => structuredClone(value);

type CanvasPropertiesPatch = Partial<Pick<SaveCanvasInput, "title" | "project" | "workflowKind" | "icon" | "starred" | "coverMediaId">>;

function memorySave(input: SaveCanvasInput): CanvasDocumentSummary {
  const previous = memoryDocuments.get(input.id);
  const summary: CanvasDocumentSummary = {
    id: input.id,
    title: input.title,
    project: input.project,
    canvasType: input.canvasType,
    workflowKind: input.workflowKind,
    icon: input.icon,
    starred: input.starred,
    createdAt: previous?.createdAt ?? now(),
    updatedAt: now(),
    revision: (previous?.revision ?? 0) + 1,
    previewDataUrl: previous?.previewDataUrl ?? null,
    coverMediaId: input.coverMediaId,
  };
  memoryDocuments.set(input.id, { ...summary, canvas: clone(input.canvas) });
  return summary;
}

async function updateCanvasProperties(id: string, properties: CanvasPropertiesPatch): Promise<CanvasDocumentSummary | null> {
  const document = isTauriRuntime
    ? await invoke<CanvasDocument | null>("get_canvas", { id })
    : clone(memoryDocuments.get(id) ?? null);
  if (!document) return null;
  const input: SaveCanvasInput = {
    id,
    title: properties.title ?? document.title,
    project: properties.project ?? document.project,
    canvasType: document.canvasType,
    workflowKind: properties.workflowKind ?? document.workflowKind,
    icon: properties.icon ?? document.icon,
    starred: properties.starred ?? document.starred,
    coverMediaId: properties.coverMediaId === undefined ? document.coverMediaId : properties.coverMediaId,
    expectedRevision: document.revision,
    canvas: document.canvas,
  };
  if (isTauriRuntime) return invoke("save_canvas", { input });
  return memorySave(input);
}

export function canvasToSnapshot(state: EndlessCanvasState): CanvasSnapshot {
  const layers = state.layers ?? [];
  return {
    schemaVersion: 2,
    activeLayerId: state.activeLayerId ?? layers[0]?.id ?? "main",
    focusedLayerId: state.focusedLayerId ?? null,
    unfocusedLayerOpacity: state.unfocusedLayerOpacity ?? 0.35,
    viewport: { x: state.viewport?.x ?? 0, y: state.viewport?.y ?? 0, scale: state.viewport?.scale ?? 1 },
    layers: layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      zIndex: layer.zIndex,
      visible: layer.visible,
      opacity: layer.opacity,
      interactionColor: layer.interactionColor ?? 0x3b82f6,
    })),
    objects: state.objects.map((object, sortIndex) => ({
      id: object.id,
      layerId: object.layerId,
      objectType: object.type,
      sortIndex,
      payload: JSON.parse(JSON.stringify(object)) as Record<string, unknown>,
    })),
  };
}

export function snapshotToCanvas(snapshot: CanvasSnapshot): EndlessCanvasState {
  return {
    activeLayerId: snapshot.activeLayerId,
    focusedLayerId: snapshot.focusedLayerId,
    unfocusedLayerOpacity: snapshot.unfocusedLayerOpacity,
    viewport: clone(snapshot.viewport),
    layers: clone(snapshot.layers) as CanvasLayer[],
    objects: snapshot.objects.slice().sort((a, b) => a.sortIndex - b.sortIndex).map((object) => clone(object.payload) as unknown as CanvasObject),
  };
}

export const canvasData = {
  async status(): Promise<DataServiceStatus> {
    if (isTauriRuntime) return invoke("data_service_status");
    return {
      connected: false,
      configuredSettings: null,
      activeSettings: null,
      error: "Browser preview uses a temporary in-memory data adapter.",
    };
  },
  async list(): Promise<CanvasDocumentSummary[]> {
    if (isTauriRuntime) return invoke("list_canvases");
    return [...memoryDocuments.values()].sort((a, b) => b.updatedAt - a.updatedAt).map(({ canvas: _canvas, ...summary }) => clone(summary));
  },
  async projectReminders(projectId: string): Promise<ProjectReminder[]> {
    if (isTauriRuntime) return invoke("list_project_reminders", { projectId });
    return clone(memoryProjectReminders.get(projectId) ?? []);
  },
  async createProjectReminder(input: ProjectReminderCreate): Promise<ProjectReminder> {
    if (isTauriRuntime) return invoke("create_project_reminder", input);
    const timestamp = now();
    const reminders = memoryProjectReminders.get(input.projectId) ?? [];
    const completed = input.subtasks.length > 0
      ? input.subtasks.every((subtask) => subtask.completed)
      : input.completed;
    const reminder = {
      id: crypto.randomUUID(),
      title: input.title,
      notes: "",
      subtasks: input.subtasks.map((subtask) => ({ ...subtask })),
      completedAt: completed ? timestamp : null,
      sortIndex: reminders.length,
    };
    memoryProjectReminders.set(input.projectId, [...reminders, reminder]);
    return clone(reminder);
  },
  async updateProjectReminder(input: ProjectReminderUpdate): Promise<ProjectReminder | null> {
    if (isTauriRuntime) return invoke("update_project_reminder", input);
    const reminders = memoryProjectReminders.get(input.projectId) ?? [];
    const index = reminders.findIndex((reminder) => reminder.id === input.id);
    if (index < 0) return null;
    const completed = input.subtasks.length > 0
      ? input.subtasks.every((subtask) => subtask.completed)
      : input.completed;
    const saved = {
      ...reminders[index],
      title: input.title,
      subtasks: input.subtasks.map((subtask) => ({ ...subtask })),
      completedAt: completed ? reminders[index].completedAt ?? now() : null,
    };
    reminders[index] = saved;
    memoryProjectReminders.set(input.projectId, reminders);
    return clone(saved);
  },
  async deleteProjectReminder(projectId: string, id: string): Promise<boolean> {
    if (isTauriRuntime) return invoke("delete_project_reminder", { projectId, id });
    const reminders = memoryProjectReminders.get(projectId) ?? [];
    const reminder = reminders.find((candidate) => candidate.id === id);
    if (!reminder) return false;
    memoryProjectReminders.set(projectId, reminders.filter((candidate) => candidate.id !== id));
    memoryDeletedProjectReminders.set(id, { projectId, reminder });
    return true;
  },
  async restoreProjectReminder(input: ProjectReminderUpdate): Promise<ProjectReminder | null> {
    if (isTauriRuntime) return invoke("restore_project_reminder", input);
    const deleted = memoryDeletedProjectReminders.get(input.id);
    if (!deleted || deleted.projectId !== input.projectId) return null;
    const completed = input.subtasks.length > 0
      ? input.subtasks.every((subtask) => subtask.completed)
      : input.completed;
    const saved = {
      ...deleted.reminder,
      title: input.title,
      subtasks: input.subtasks.map((subtask) => ({ ...subtask })),
      completedAt: completed ? deleted.reminder.completedAt ?? now() : null,
    };
    const reminders = memoryProjectReminders.get(input.projectId) ?? [];
    memoryProjectReminders.set(input.projectId, [...reminders, saved]);
    memoryDeletedProjectReminders.delete(input.id);
    return clone(saved);
  },
  async get(id: string): Promise<CanvasDocument | null> {
    if (isTauriRuntime) return invoke("get_canvas", { id });
    return clone(memoryDocuments.get(id) ?? null);
  },
  async save(input: SaveCanvasInput): Promise<CanvasDocumentSummary> {
    if (isTauriRuntime) return invoke("save_canvas", { input });
    return memorySave(input);
  },
  async seed(inputs: SaveCanvasInput[]): Promise<boolean> {
    if (isTauriRuntime) return invoke("seed_canvases", { inputs });
    if (memorySeeded) return false;
    inputs.forEach(memorySave);
    memorySeeded = true;
    return true;
  },
  async setStarred(id: string, starred: boolean): Promise<CanvasDocumentSummary | null> {
    if (isTauriRuntime) return invoke("set_canvas_starred", { id, starred });
    const document = memoryDocuments.get(id);
    if (!document) return null;
    return memorySave({ id, title: document.title, project: document.project, canvasType: document.canvasType, workflowKind: document.workflowKind, icon: document.icon, starred, coverMediaId: document.coverMediaId, expectedRevision: null, canvas: document.canvas });
  },
  async setTitle(id: string, title: string): Promise<CanvasDocumentSummary | null> {
    if (isTauriRuntime) return invoke("set_canvas_title", { id, title });
    const document = memoryDocuments.get(id);
    if (!document) return null;
    return memorySave({ id, title, project: document.project, canvasType: document.canvasType, workflowKind: document.workflowKind, icon: document.icon, starred: document.starred, coverMediaId: document.coverMediaId, expectedRevision: null, canvas: document.canvas });
  },
  async moveToProject(id: string, project: string): Promise<CanvasDocumentSummary | null> {
    return updateCanvasProperties(id, { project });
  },
  async updateProperties(id: string, properties: CanvasPropertiesPatch): Promise<CanvasDocumentSummary | null> {
    return updateCanvasProperties(id, properties);
  },
  async delete(id: string): Promise<boolean> {
    if (isTauriRuntime) return invoke("delete_canvas", { id });
    return memoryDocuments.delete(id);
  },
  async savePreview(id: string, dataUrl: string): Promise<boolean> {
    if (isTauriRuntime) return invoke("save_canvas_preview", { id, dataUrl });
    const document = memoryDocuments.get(id);
    if (!document) return false;
    document.previewDataUrl = dataUrl;
    return true;
  },
};
