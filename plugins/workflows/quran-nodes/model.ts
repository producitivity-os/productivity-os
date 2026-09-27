import type { QuranRecording } from "@productivity-os/workflow-plugin-sdk";

export type QuranNodeData = Record<string, unknown> & {
  surahNumber: number;
  surahName: string;
  ayahStart: number;
  endSurahNumber: number;
  endSurahName: string;
  ayahEnd: number;
  latestDurationMs: number;
  attemptCount: number;
  recordingId: string | null;
  recordingUpdatedAt: number;
  pendingRecordingId: string | null;
  captureSessionId: string | null;
  pendingAfterUpdatedAt: number;
};

export const createQuranNodeData = (): QuranNodeData => ({
  surahNumber: 1,
  surahName: "Al-Fatihah",
  ayahStart: 1,
  endSurahNumber: 1,
  endSurahName: "Al-Fatihah",
  ayahEnd: 7,
  latestDurationMs: 0,
  attemptCount: 0,
  recordingId: null,
  recordingUpdatedAt: 0,
  pendingRecordingId: null,
  captureSessionId: null,
  pendingAfterUpdatedAt: 0,
});

export function migrateQuranNodeData(data: Record<string, unknown>): QuranNodeData {
  const defaults = createQuranNodeData();
  const legacyRecordingId = typeof data.lastProcessedRecordingId === "string"
    ? data.lastProcessedRecordingId
    : null;
  return {
    ...defaults,
    ...data,
    recordingId: typeof data.recordingId === "string" ? data.recordingId : legacyRecordingId,
    recordingUpdatedAt: Number(data.recordingUpdatedAt) || 0,
    endSurahNumber: Number(data.endSurahNumber) || Number(data.surahNumber) || defaults.endSurahNumber,
    endSurahName: typeof data.endSurahName === "string" ? data.endSurahName : typeof data.surahName === "string" ? data.surahName : defaults.endSurahName,
    pendingRecordingId: typeof data.pendingRecordingId === "string" ? data.pendingRecordingId : null,
    captureSessionId: typeof data.captureSessionId === "string" ? data.captureSessionId : null,
    pendingAfterUpdatedAt: Number(data.pendingAfterUpdatedAt) || 0,
  } as QuranNodeData;
}

export function applyQuranRecording(data: QuranNodeData, recording: QuranRecording): QuranNodeData {
  return {
    ...data,
    recordingId: recording.id,
    recordingUpdatedAt: recording.updatedAt,
    pendingRecordingId: null,
    captureSessionId: null,
    pendingAfterUpdatedAt: 0,
    latestDurationMs: recording.durationMs,
  };
}
