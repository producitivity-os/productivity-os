import * as React from "react";
import { BookOpenText } from "lucide-react";
import { Graphics, Text } from "pixi.js";
import {
  WorkflowNodeButton,
  WorkflowNodeProgressBar,
  WorkflowNodeWaveform,
  type WorkflowNodePickerPreviewProps,
  type WorkflowNodePluginPackage,
  type WorkflowPluginActionResult,
  type WorkflowPluginNode,
  type WorkflowPluginPropertiesProps,
} from "@productivity-os/workflow-plugin-sdk";
import { QURAN_SURAHS } from "./surahs";
import { quranNodeTheme, quranPalette } from "./theme";
import {
  createQuranNodeData,
  migrateQuranNodeData,
  type QuranNodeData,
} from "./model";
import { quranPlayback } from "./playback";

export type { QuranNodeData } from "./model";

const recordIconUrl = new URL(
  "../../../apps/Workflows/src/assets/svg/circle.svg",
  import.meta.url,
).href;

function QuranPreview({ palette }: WorkflowNodePickerPreviewProps) {
  return (
    <span
      className="workflow-plugin-node-preview"
      style={
        {
          "--workflow-plugin-surface": palette.surface,
          "--workflow-plugin-border": palette.border,
          "--workflow-plugin-foreground": palette.foreground,
          "--workflow-plugin-muted": palette.mutedForeground,
        } as React.CSSProperties
      }
    >
      <span className="workflow-plugin-preview-icon" aria-hidden="true">
        <img src={recordIconUrl} alt="" />
      </span>
      <span className="workflow-plugin-preview-copy">
        <strong>Al-Fatihah 1–7</strong>
        <small>▂▄▆▃▇▅▂▄</small>
      </span>
    </span>
  );
}

function clearedRecordingData(_data: QuranNodeData): Partial<QuranNodeData> {
  return {
    recordingId: null,
    recordingUpdatedAt: 0,
    pendingRecordingId: null,
    captureSessionId: null,
    pendingAfterUpdatedAt: 0,
    latestDurationMs: 0,
    attemptCount: 0,
  };
}

function QuranProperties({
  node,
  updateNode,
}: WorkflowPluginPropertiesProps<QuranNodeData>) {
  const data = migrateQuranNodeData(node.pluginData);
  const surah = QURAN_SURAHS[data.surahNumber - 1] ?? QURAN_SURAHS[0];
  const endSurah = QURAN_SURAHS[data.endSurahNumber - 1] ?? surah;
  const update = (patch: Partial<QuranNodeData>) =>
    updateNode({ pluginData: { ...data, ...patch } });
  const errors = {
    start:
      data.ayahStart < 1 || data.ayahStart > surah.ayahCount
        ? `Use 1–${surah.ayahCount}.`
        : "",
    end:
      data.ayahEnd < 1 || data.ayahEnd > endSurah.ayahCount || (surah.number === endSurah.number && data.ayahEnd < data.ayahStart)
        ? `Use ${surah.number === endSurah.number ? Math.max(1, data.ayahStart) : 1}–${endSurah.ayahCount}.`
        : "",
  };
  return (
    <>
      <label className="canvas-property-control">
        <span>Surah</span>
        <select
          value={surah.number}
          onChange={(event) => {
            const next =
              QURAN_SURAHS[Number(event.currentTarget.value) - 1] ??
              QURAN_SURAHS[0];
            update({
              surahNumber: next.number,
              surahName: next.name,
              ayahStart: 1,
              endSurahNumber: next.number,
              endSurahName: next.name,
              ayahEnd: next.ayahCount,
              ...clearedRecordingData(data),
            });
          }}
        >
          {QURAN_SURAHS.map((item) => (
            <option key={item.number} value={item.number}>
              {item.number}. {item.name}
            </option>
          ))}
        </select>
      </label>
      <label className="canvas-property-control">
        <span>First ayah</span>
        <input
          type="number"
          min={1}
          max={surah.ayahCount}
          value={data.ayahStart}
          aria-invalid={Boolean(errors.start)}
          onChange={(event) =>
            update({
              ayahStart: event.currentTarget.valueAsNumber || 1,
              ...clearedRecordingData(data),
            })
          }
        />
      </label>
      {errors.start && (
        <small className="workflow-plugin-field-error">{errors.start}</small>
      )}
      <label className="canvas-property-control">
        <span>End Surah</span>
        <select
          value={endSurah.number}
          onChange={(event) => {
            const next = QURAN_SURAHS[Number(event.currentTarget.value) - 1] ?? surah;
            if (next.number < surah.number) return;
            update({
              endSurahNumber: next.number,
              endSurahName: next.name,
              ayahEnd: next.number === surah.number ? Math.max(data.ayahStart, Math.min(data.ayahEnd, next.ayahCount)) : next.ayahCount,
              ...clearedRecordingData(data),
            });
          }}
        >
          {QURAN_SURAHS.filter((item) => item.number >= surah.number).map((item) => <option key={item.number} value={item.number}>{item.number}. {item.name}</option>)}
        </select>
      </label>
      <label className="canvas-property-control">
        <span>Last ayah</span>
        <input
          type="number"
          min={endSurah.number === surah.number ? data.ayahStart : 1}
          max={endSurah.ayahCount}
          value={data.ayahEnd}
          aria-invalid={Boolean(errors.end)}
          onChange={(event) =>
            update({
              ayahEnd: event.currentTarget.valueAsNumber || data.ayahStart,
              ...clearedRecordingData(data),
            })
          }
        />
      </label>
      {errors.end && (
        <small className="workflow-plugin-field-error">{errors.end}</small>
      )}
      <div className="workflow-plugin-summary">
        <span>{data.attemptCount} attempts</span>
        <span>
          {data.latestDurationMs
            ? `${Math.round(data.latestDurationMs / 1_000)}s latest`
            : "No recordings yet"}
        </span>
      </div>
    </>
  );
}

const quranCompletionProgress = new WorkflowNodeProgressBar<
  WorkflowPluginNode<QuranNodeData>
>({
  id: "quran:completion",
  bounds: (node) => ({ x: 0, y: 0, width: node.width, height: node.height }),
  value: (node) => (node.completed ? 1 : 0),
  theme: quranNodeTheme.progress,
  radius: 20,
  animationDurationMs: 300,
});

const quranWaveform = new WorkflowNodeWaveform<
  WorkflowPluginNode<QuranNodeData>
>({
  id: "quran:waveform",
  bounds: (node) => ({
    x: 60,
    y: 36,
    width: Math.max(24, node.width - 74),
    height: 18,
  }),
  peaks: (node) => quranPlayback.waveform(node.id),
  disabled: (node) =>
    migrateQuranNodeData(node.pluginData).recordingId === null,
  progress: (node) => {
    const data = migrateQuranNodeData(node.pluginData);
    return data.latestDurationMs > 0
      ? quranPlayback.state(node.id).playheadMs / data.latestDurationMs
      : 0;
  },
  theme: quranNodeTheme.waveform,
  radius: 9,
  barWidth: 2,
  barGap: 1.5,
  minimumAmplitude: 0.14,
});

const recordButton = new WorkflowNodeButton<
  WorkflowPluginNode<QuranNodeData>,
  WorkflowPluginPropertiesProps<QuranNodeData>["services"],
  WorkflowPluginActionResult<QuranNodeData>
>({
  id: "quran:record",
  bounds: (node) => ({ x: 12, y: node.height / 2 - 19, width: 38, height: 38 }),
  icon: "record",
  theme: quranNodeTheme.recordButton,
  radius: 19,
  iconSize: 15,
  async onPress({ node, workflowId, services }) {
    const data = migrateQuranNodeData(node.pluginData);
    const surah = QURAN_SURAHS[data.surahNumber - 1];
    if (
      !surah ||
      data.ayahStart < 1 ||
      data.endSurahNumber < data.surahNumber ||
      data.ayahEnd < 1 ||
      data.ayahEnd > (QURAN_SURAHS[data.endSurahNumber - 1]?.ayahCount ?? 0) ||
      (data.endSurahNumber === data.surahNumber && data.ayahEnd < data.ayahStart)
    )
      throw new Error("Choose a valid Surah and ayah range first.");
    const current = data.recordingId
      ? services.resolveQuranRecording(data.recordingId)
      : null;
    const selection = current ? quranPlayback.selection(node.id) : null;
    const editing = current !== null && selection !== null;
    const resuming = Boolean(data.captureSessionId && data.pendingRecordingId);
    const recordingId = resuming
      ? data.pendingRecordingId!
      : editing
      ? current.id
      : `quran-recording-${crypto.randomUUID()}`;
    const captureSessionId = resuming
      ? data.captureSessionId!
      : crypto.randomUUID();
    const pendingAfterUpdatedAt = editing ? current.updatedAt : 0;
    quranPlayback.stop(node.id);
    await services.launchQuranRevision({
      workflowId,
      nodeId: node.id,
      captureSessionId,
      recordingId,
      replaceStartMs: editing ? selection : null,
      surahNumber: surah.number,
      surahName: surah.name,
      ayahStart: data.ayahStart,
      endSurahNumber: data.endSurahNumber,
      endSurahName: data.endSurahName,
      ayahEnd: data.ayahEnd,
    });
    quranPlayback.clearSelection(node.id);
    return {
      pluginData: {
        ...data,
        pendingRecordingId: recordingId,
        captureSessionId,
        pendingAfterUpdatedAt,
      },
    };
  },
});

const plugin: WorkflowNodePluginPackage = {
  manifest: {
    id: "workflows.quran-nodes",
    name: "Quran Nodes",
    version: "2.0.0",
    description: "Record and edit Quran revision attempts from a workflow.",
    marketplace: true,
    defaultInstalled: true,
    app: {
      id: "quran",
      name: "Quran",
      icon: BookOpenText,
      launchTarget: "quran",
      palette: quranPalette,
    },
  },
  nodes: [
    {
      nodeType: "quran-revision",
      title: "Revise",
      description: "Record a Surah and ayah range",
      icon: BookOpenText,
      schemaVersion: 3,
      defaultSize: { width: 280, height: 68 },
      NodePickerPreview: QuranPreview,
      createData: createQuranNodeData,
      migrate: migrateQuranNodeData,
      PropertiesEditor: QuranProperties,
      buttons: [recordButton],
      progressBars: [quranCompletionProgress],
      waveforms: [quranWaveform],
      onPointerGesture(node, regionId, gesture, _workflowId, services) {
        if (regionId !== quranWaveform.id) return false;
        const data = migrateQuranNodeData(node.pluginData);
        const recording = data.recordingId
          ? services.resolveQuranRecording(data.recordingId)
          : null;
        if (!recording || recording.durationMs <= 0) return false;
        quranPlayback.bind(node.id, recording, services);
        const positionMs =
          quranWaveform.position(node, gesture.localPoint.x) *
          recording.durationMs;
        if (gesture.phase === "start")
          quranPlayback.beginScrub(node.id, positionMs);
        else if (gesture.phase === "move")
          quranPlayback.moveScrub(node.id, positionMs);
        else if (gesture.phase === "end")
          quranPlayback.endScrub(node.id, positionMs);
        else quranPlayback.cancelScrub(node.id);
        return false;
      },
      render(target, rawNode, context, services) {
        const node = rawNode as WorkflowPluginNode<QuranNodeData>;
        const data = migrateQuranNodeData(node.pluginData);
        const recording = data.recordingId
          ? services.resolveQuranRecording(data.recordingId)
          : null;
        quranPlayback.bind(node.id, recording, services);
        quranCompletionProgress.renderContent(
          target,
          node,
          context,
          (content, contentNode, _renderContext, inverted) => {
            const contentData = migrateQuranNodeData(contentNode.pluginData);
            const title = new Text({
              text: contentData.endSurahNumber === contentData.surahNumber
                ? `${contentData.surahName} ${contentData.ayahStart}–${contentData.ayahEnd}`
                : `${contentData.surahName} ${contentData.ayahStart} – ${contentData.endSurahName} ${contentData.ayahEnd}`,
              style: {
                fill: inverted
                  ? quranNodeTheme.surface
                  : quranNodeTheme.foreground,
                fontFamily: quranNodeTheme.typography.fontFamily,
                fontSize: quranNodeTheme.typography.titleSize,
                fontWeight: quranNodeTheme.typography.titleWeight,
              },
            });
            title.position.set(60, 12);
            content.addChild(title);
          },
        );
        target.addChild(
          new Graphics()
            .roundRect(0, 0, node.width, node.height, 20)
            .stroke({ color: quranNodeTheme.border, width: 1.5 }),
        );
      },
      reset(rawData) {
        const data = migrateQuranNodeData(rawData);
        return {
          ...createQuranNodeData(),
          surahNumber: data.surahNumber,
          surahName: data.surahName,
          ayahStart: data.ayahStart,
          endSurahNumber: data.endSurahNumber,
          endSurahName: data.endSurahName,
          ayahEnd: data.ayahEnd,
        };
      },
    },
  ],
  dispose: () => quranPlayback.dispose(),
};

export default plugin;
