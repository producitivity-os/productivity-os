import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "./canvas-data";

export type WorkflowPluginInstallation = {
  pluginId: string;
  installed: boolean;
  installedAt: number | null;
};

export type BookEntity = {
  cardId: string;
  notebookId: string;
  notebookTitle: string;
  title: string;
  authorName: string;
  coverMediaId: string | null;
  coverWidth: number | null;
  coverHeight: number | null;
};

export type QuranRecording = {
  id: string;
  sessionId: string;
  origin: "workflow" | "standalone";
  status: "draft" | "recording" | "paused" | "ready" | "checking" | "completed" | "cancelled" | "failed";
  workflowId: string | null;
  nodeId: string | null;
  surahNumber: number;
  surahName: string;
  ayahStart: number;
  endSurahNumber: number;
  endSurahName: string;
  ayahEnd: number;
  durationMs: number;
  createdAt: number;
  updatedAt: number;
  segments: Array<{
    id: string;
    mediaId: string;
    sequence: number;
    startMs: number;
    sourceStartMs: number;
    durationMs: number;
    waveformPeaks: number[];
  }>;
  boundaries: Array<{ verseKey: string; sequence: number; startMs: number }>;
  mistakes: Array<{ id: string; startVerseKey: string; startWordPosition: number; endVerseKey: string; endWordPosition: number; textSnapshot: string; createdAt: number }>;
};

export type HealthWaterDay = {
  localDate: string;
  targetMilliliters: number;
  intakeMilliliters: number;
  updatedAt: number;
};
export type NutritionWaterDay = HealthWaterDay;
export type NutritionFoodEntry = {
  id: string;
  localDate: string;
  mealName: string;
  quantity: number;
  workflowId: string;
  nodeId: string;
  loggedAt: number;
};

export type RevisionNotebook = { id: string; title: string };
export type RevisionSessionGoal =
  | { type: "time"; durationMs: number }
  | { type: "cards"; cardCount: number };
export type RevisionSessionResult = {
  sequence: number;
  notebookId: string;
  cardId: string;
  question: string;
  expectedAnswer: string;
  answer: "again" | "hard" | "good" | "easy";
  correct: boolean;
  answeredAt: number;
};
export type RevisionSession = {
  id: string;
  workflowId: string;
  nodeId: string;
  notebookId: string | null;
  goal: RevisionSessionGoal;
  elapsedMs: number;
  status: "idle" | "running" | "paused" | "completed" | "cancelled";
  totalCards: number;
  remainingCards: number;
  reviewedCount: number;
  rightCount: number;
  wrongCount: number;
  startedAt: number | null;
  createdAt: number;
  updatedAt: number;
  results: RevisionSessionResult[];
};

const INSTALLATIONS_KEY = "productivity-os.workflows.plugin-installations";
const PREFERENCES_KEY = "productivity-os.workflows.plugin-preferences";
const NUTRITION_FOOD_KEY = "productivity-os.nutrition.food-v1";
const defaults: WorkflowPluginInstallation[] = [
  { pluginId: "workflows.quran-nodes", installed: true, installedAt: null },
  { pluginId: "workflows.book-nodes", installed: true, installedAt: null },
  { pluginId: "workflows.health-nodes", installed: true, installedAt: null },
  { pluginId: "workflows.revise-nodes", installed: true, installedAt: null },
];

function browserInstallations(): WorkflowPluginInstallation[] {
  try {
    const stored = JSON.parse(localStorage.getItem(INSTALLATIONS_KEY) ?? "[]") as WorkflowPluginInstallation[];
    const byId = new Map(defaults.map((item) => [item.pluginId, item]));
    for (const item of stored) byId.set(item.pluginId, item);
    return [...byId.values()];
  } catch {
    return defaults;
  }
}

function browserPreferences(): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

export const workflowPluginsData = {
  async installations(): Promise<WorkflowPluginInstallation[]> {
    if (isTauriRuntime) return invoke("list_workflow_plugin_installations");
    return browserInstallations();
  },

  async setInstalled(pluginId: string, installed: boolean): Promise<WorkflowPluginInstallation> {
    if (isTauriRuntime)
      return invoke("set_workflow_plugin_installed", { pluginId, installed });
    const next = { pluginId, installed, installedAt: installed ? Date.now() : null };
    const values = browserInstallations().filter((item) => item.pluginId !== pluginId);
    values.push(next);
    localStorage.setItem(INSTALLATIONS_KEY, JSON.stringify(values));
    window.dispatchEvent(new CustomEvent("workflows:plugins-changed", { detail: next }));
    return next;
  },

  async getPreference<T>(pluginId: string, key: string): Promise<T | null> {
    if (isTauriRuntime) {
      const result = await invoke<{ value: T } | null>("get_workflow_plugin_preference", { pluginId, key });
      return result?.value ?? null;
    }
    return (browserPreferences()[`${pluginId}:${key}`] as T | undefined) ?? null;
  },

  async setPreference<T>(pluginId: string, key: string, value: T): Promise<void> {
    if (isTauriRuntime) {
      await invoke("set_workflow_plugin_preference", { pluginId, key, value });
      return;
    }
    const values = browserPreferences();
    values[`${pluginId}:${key}`] = value;
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(values));
  },

  async books(): Promise<BookEntity[]> {
    if (isTauriRuntime) return invoke("list_book_entities");
    return [];
  },

  async quranRecordings(workflowId: string, nodeId?: string): Promise<QuranRecording[]> {
    if (!isTauriRuntime) return [];
    return invoke("list_quran_recordings", {
      query: { workflowId, nodeId: nodeId ?? null },
    });
  },

  async cacheQuranRecordingSegmentPeaks(segmentId: string, waveformPeaks: number[]): Promise<void> {
    if (!isTauriRuntime) return;
    await invoke("cache_quran_recording_segment_peaks", {
      input: { segmentId, waveformPeaks },
    });
  },

  async launchQuranRevision(input: {
    workflowId: string;
    nodeId: string;
    captureSessionId: string;
    recordingId: string;
    replaceStartMs: number | null;
    surahNumber: number;
    surahName: string;
    ayahStart: number;
    endSurahNumber: number;
    endSurahName: string;
    ayahEnd: number;
  }): Promise<void> {
    if (!isTauriRuntime) throw new Error("Quran recording is available in the desktop app.");
    await invoke("launch_quran_revision", input);
  },

  async healthWaterDay(localDate: string): Promise<HealthWaterDay> {
    if (!isTauriRuntime) {
      const values = JSON.parse(localStorage.getItem("productivity-os.health.water-v1") ?? "{}") as Record<string, HealthWaterDay>;
      return values[localDate] ?? { localDate, targetMilliliters: 2_000, intakeMilliliters: 0, updatedAt: Date.now() };
    }
    return invoke("get_health_water_day", { localDate });
  },

  async saveHealthWater(input: HealthWaterDay): Promise<HealthWaterDay> {
    if (!isTauriRuntime) {
      const saved = { ...input, updatedAt: Date.now() };
      const values = JSON.parse(localStorage.getItem("productivity-os.health.water-v1") ?? "{}") as Record<string, HealthWaterDay>;
      values[input.localDate] = saved;
      localStorage.setItem("productivity-os.health.water-v1", JSON.stringify(values));
      return saved;
    }
    return invoke("save_health_water", { input });
  },

  async nutritionWaterDay(localDate: string): Promise<NutritionWaterDay> {
    return this.healthWaterDay(localDate);
  },

  async saveNutritionWater(input: NutritionWaterDay): Promise<NutritionWaterDay> {
    if (isTauriRuntime) return invoke("save_nutrition_water", { input });
    return this.saveHealthWater(input);
  },

  async nutritionFood(localDate: string): Promise<NutritionFoodEntry[]> {
    if (isTauriRuntime) return invoke("list_nutrition_food", { localDate });
    try {
      const values = JSON.parse(localStorage.getItem(NUTRITION_FOOD_KEY) ?? "[]") as NutritionFoodEntry[];
      return values.filter((entry) => entry.localDate === localDate).sort((a, b) => b.loggedAt - a.loggedAt);
    } catch {
      return [];
    }
  },

  async saveNutritionFood(input: NutritionFoodEntry): Promise<NutritionFoodEntry> {
    if (isTauriRuntime) return invoke("save_nutrition_food", { input });
    let values: NutritionFoodEntry[] = [];
    try { values = JSON.parse(localStorage.getItem(NUTRITION_FOOD_KEY) ?? "[]") as NutritionFoodEntry[]; }
    catch { values = []; }
    const saved = { ...input };
    values = [...values.filter((entry) => entry.id !== saved.id), saved];
    localStorage.setItem(NUTRITION_FOOD_KEY, JSON.stringify(values));
    window.dispatchEvent(new CustomEvent("nutrition:food-changed", { detail: saved }));
    return saved;
  },

  async revisionNotebooks(): Promise<RevisionNotebook[]> {
    if (!isTauriRuntime) return [];
    return invoke("list_revision_notebooks");
  },

  async revisionSession(id: string): Promise<RevisionSession | null> {
    if (!isTauriRuntime) return null;
    return invoke("get_revision_session", { id });
  },

  async launchRevisionSession(input: {
    workflowId: string;
    nodeId: string;
    sessionId: string;
    notebookId: string | null;
    goal: RevisionSessionGoal;
  }): Promise<RevisionSession> {
    if (!isTauriRuntime)
      throw new Error("Timed revision sessions are available in the desktop app.");
    return invoke("launch_revision_session", input);
  },

  async setRevisionSessionStatus(id: string, status: "running" | "paused" | "cancelled"): Promise<RevisionSession> {
    if (!isTauriRuntime)
      throw new Error("Revision sessions are available in the desktop app.");
    return invoke("set_revision_session_status", { id, status });
  },
};

export function bookCoverUrl(mediaId: string, variant: "content" | "thumbnail" = "thumbnail"): string {
  return isTauriRuntime
    ? `book-media://localhost/${encodeURIComponent(mediaId)}/${variant}`
    : "";
}
