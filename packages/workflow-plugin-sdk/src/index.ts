import type * as React from "react";
import type { Container } from "pixi.js";
import type { LucideIcon } from "lucide-react";
import type {
  WorkflowNodeButton,
  WorkflowNodeProgressBar,
  WorkflowNodeWaveform,
} from "./node-controls.ts";

export {
  WorkflowNodeButton,
  WorkflowNodeProgressBar,
  WorkflowNodeWaveform,
  clampWorkflowNodeProgress,
  normalizeWorkflowNodeWaveformPeak,
  setWorkflowNodeButtonIconRenderer,
} from "./node-controls.ts";
export type {
  WorkflowNodeButtonConfig,
  WorkflowNodeButtonIcon,
  WorkflowNodeButtonIconRenderer,
  WorkflowNodeButtonPressContext,
  WorkflowNodeButtonRenderState,
  WorkflowNodeButtonTheme,
  WorkflowNodeControlBounds,
  WorkflowNodeControlInteractionContext,
  WorkflowNodeControlRenderContext,
  WorkflowNodeProgressConfig,
  WorkflowNodeProgressContentRenderer,
  WorkflowNodeProgressTheme,
  WorkflowNodeWaveformConfig,
  WorkflowNodeWaveformTheme,
} from "./node-controls.ts";

export type CanvasObjectPointerInteractionRegion = {
  id: string;
  bounds: { x: number; y: number; width: number; height: number };
  cursor?: string;
};

export type WorkflowNodePointerGesture = {
  phase: "start" | "move" | "end" | "cancel";
  localPoint: { x: number; y: number };
};

export type CanvasRenderContext = {
  scale: number;
  editing?: boolean;
  hovered: boolean;
  hoveredRegionId?: string;
  selected: boolean;
  interactionColor: number;
  imageCrop?: {
    imageId: string;
    source: { x: number; y: number; width: number; height: number };
    frame: { x: number; y: number; width: number; height: number };
  };
};

export type WorkflowPluginNode<
  TData extends Record<string, unknown> = Record<string, unknown>,
> = {
  id: string;
  type: "workflow-node";
  layerId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  nodeKind: "plugin";
  name: string;
  pluginId: string;
  pluginNodeType: string;
  pluginVersion: number;
  pluginData: TData;
  completed: boolean;
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
  segments: QuranRecordingSegment[];
  boundaries: Array<{ verseKey: string; sequence: number; startMs: number }>;
  mistakes: Array<{
    id: string;
    startVerseKey: string;
    startWordPosition: number;
    endVerseKey: string;
    endWordPosition: number;
    textSnapshot: string;
    createdAt: number;
  }>;
};

export type QuranRecordingSegment = {
  id: string;
  mediaId: string;
  sequence: number;
  startMs: number;
  sourceStartMs: number;
  durationMs: number;
  waveformPeaks: number[];
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

export type SaveNutritionFoodInput = NutritionFoodEntry;

export type RevisionNotebook = {
  id: string;
  title: string;
};

export type RevisionSessionStatus =
  "idle" | "running" | "paused" | "completed" | "cancelled";

export type RevisionSessionGoal =
  { type: "time"; durationMs: number } | { type: "cards"; cardCount: number };

export type RevisionSessionAnswer = "again" | "hard" | "good" | "easy";

export type RevisionSessionResult = {
  sequence: number;
  notebookId: string;
  cardId: string;
  question: string;
  expectedAnswer: string;
  answer: RevisionSessionAnswer;
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
  status: RevisionSessionStatus;
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

export type WorkflowPluginServices = {
  listBooks(): Promise<BookEntity[]>;
  resolveBook(cardId: string): BookEntity | null;
  getPreference<T>(pluginId: string, key: string): Promise<T | null>;
  setPreference<T>(pluginId: string, key: string, value: T): Promise<void>;
  launchQuranRevision(input: {
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
  }): Promise<void>;
  listQuranRecordings(
    workflowId: string,
    nodeId?: string,
  ): Promise<QuranRecording[]>;
  resolveQuranRecording(id: string): QuranRecording | null;
  quranRecordingUrl(mediaId: string): string;
  cacheQuranRecordingSegmentPeaks(
    segmentId: string,
    waveformPeaks: number[],
  ): Promise<void>;
  requestRender(): void;
  bookCoverUrl(mediaId: string, variant?: "content" | "thumbnail"): string;
  healthWaterDay(localDate: string): Promise<HealthWaterDay>;
  saveHealthWater(input: HealthWaterDay): Promise<HealthWaterDay>;
  nutritionWaterDay(localDate: string): Promise<NutritionWaterDay>;
  saveNutritionWater(input: NutritionWaterDay): Promise<NutritionWaterDay>;
  listNutritionFood(localDate: string): Promise<NutritionFoodEntry[]>;
  saveNutritionFood(input: SaveNutritionFoodInput): Promise<NutritionFoodEntry>;
  listRevisionNotebooks(): Promise<RevisionNotebook[]>;
  revisionSession(id: string): Promise<RevisionSession | null>;
  launchRevisionSession(input: {
    workflowId: string;
    nodeId: string;
    sessionId: string;
    notebookId: string | null;
    goal: RevisionSessionGoal;
  }): Promise<RevisionSession>;
  setRevisionSessionStatus(
    id: string,
    status: "running" | "paused" | "cancelled",
  ): Promise<RevisionSession>;
};

export type WorkflowPluginPropertiesProps<
  TData extends Record<string, unknown> = Record<string, unknown>,
> = {
  node: WorkflowPluginNode<TData>;
  workflowId: string;
  services: WorkflowPluginServices;
  canInteract: boolean;
  /** @deprecated Use canInteract. */
  canExecute: boolean;
  updateNode(patch: Partial<WorkflowPluginNode<TData>>): void;
  completeNode(pluginData: TData): void;
};

export type WorkflowPluginActionResult<
  TData extends Record<string, unknown> = Record<string, unknown>,
> = {
  pluginData?: TData;
  nodePatch?: Partial<WorkflowPluginNode<TData>>;
  complete?: boolean;
};

export type WorkflowPluginPalette = {
  surface: string;
  border: string;
  foreground: string;
  mutedForeground: string;
};

export type WorkflowNodePickerPreviewProps = {
  palette: WorkflowPluginPalette;
};

export type WorkflowNodePluginDefinition<
  TData extends Record<string, unknown> = Record<string, unknown>,
> = {
  nodeType: string;
  title: string;
  description: string;
  icon: LucideIcon;
  schemaVersion: number;
  defaultSize: { width: number; height: number };
  outlineRadius?: number | ((node: WorkflowPluginNode<TData>) => number);
  createData(): TData;
  migrate?(data: Record<string, unknown>, fromVersion: number): TData;
  migrateNode?(
    node: WorkflowPluginNode<TData>,
    fromVersion: number,
  ): Partial<Pick<WorkflowPluginNode<TData>, "x" | "y" | "width" | "height">>;
  render(
    target: Container,
    node: WorkflowPluginNode<TData>,
    context: CanvasRenderContext,
    services: WorkflowPluginServices,
  ): void;
  NodePickerPreview?: React.ComponentType<WorkflowNodePickerPreviewProps>;
  PropertiesEditor?: React.ComponentType<WorkflowPluginPropertiesProps<TData>>;
  buttons?: readonly WorkflowNodeButton<
    WorkflowPluginNode<TData>,
    WorkflowPluginServices,
    WorkflowPluginActionResult<TData>
  >[];
  progressBars?: readonly WorkflowNodeProgressBar<WorkflowPluginNode<TData>>[];
  waveforms?: readonly WorkflowNodeWaveform<WorkflowPluginNode<TData>>[];
  pointerInteractionRegions?(
    node: WorkflowPluginNode<TData>,
  ): readonly CanvasObjectPointerInteractionRegion[];
  onInteraction?(
    node: WorkflowPluginNode<TData>,
    regionId: string,
    workflowId: string,
    services: WorkflowPluginServices,
  ):
    | Promise<WorkflowPluginActionResult<TData> | void>
    | WorkflowPluginActionResult<TData>
    | void;
  onPointerGesture?(
    node: WorkflowPluginNode<TData>,
    regionId: string,
    gesture: WorkflowNodePointerGesture,
    workflowId: string,
    services: WorkflowPluginServices,
  ): boolean | void;
  onCreate?(
    node: WorkflowPluginNode<TData>,
    workflowId: string,
    services: WorkflowPluginServices,
  ): Promise<void> | void;
  onActivate?(
    node: WorkflowPluginNode<TData>,
    workflowId: string,
    services: WorkflowPluginServices,
  ): Promise<void> | void;
  onComplete?(
    node: WorkflowPluginNode<TData>,
    workflowId: string,
    services: WorkflowPluginServices,
  ): Promise<void> | void;
  onDelete?(
    node: WorkflowPluginNode<TData>,
    workflowId: string,
    services: WorkflowPluginServices,
  ): Promise<void> | void;
  onTick?(
    node: WorkflowPluginNode<TData>,
    now: number,
    workflowId: string,
    services: WorkflowPluginServices,
  ): WorkflowPluginActionResult<TData> | void;
  reset?(data: TData): TData;
};

export type WorkflowNodePluginPackage = {
  manifest: {
    id: string;
    name: string;
    version: string;
    description: string;
    marketplace?: boolean;
    defaultInstalled?: boolean;
    app: {
      id: string;
      name: string;
      icon: LucideIcon;
      launchTarget?: string;
      palette?: WorkflowPluginPalette;
    };
  };
  nodes: readonly WorkflowNodePluginDefinition<any>[];
  onInstall?(services: WorkflowPluginServices): Promise<void> | void;
  onUninstall?(services: WorkflowPluginServices): Promise<void> | void;
  dispose?(): void;
};
