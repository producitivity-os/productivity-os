import assert from "node:assert/strict";
import test from "node:test";
import type { QuranRecording } from "../../../packages/workflow-plugin-sdk/src/index.ts";
import type { WorkflowPluginServices } from "../../../packages/workflow-plugin-sdk/src/index.ts";
import {
  QuranRecordingPlaybackController,
  quranRecordingSourceAt,
} from "../../../plugins/workflows/quran-nodes/playback.ts";

const recording: QuranRecording = {
  id: "recording",
  sessionId: "session",
  workflowId: "workflow",
  nodeId: "node",
  surahNumber: 1,
  surahName: "Al-Fatihah",
  ayahStart: 1,
  ayahEnd: 7,
  durationMs: 20_000,
  createdAt: 1,
  updatedAt: 2,
  segments: [
    { id: "a", mediaId: "media-a", sequence: 0, startMs: 0, sourceStartMs: 0, durationMs: 10_000, waveformPeaks: [] },
    { id: "b", mediaId: "media-b", sequence: 1, startMs: 10_000, sourceStartMs: 5_000, durationMs: 10_000, waveformPeaks: [] },
  ],
};

test("segmented Quran playback crosses boundaries and seeks into cropped source offsets", () => {
  assert.deepEqual(quranRecordingSourceAt(recording, 9_999), {
    segmentIndex: 0,
    segment: recording.segments[0],
    sourcePositionMs: 9_999,
  });
  assert.deepEqual(quranRecordingSourceAt(recording, 10_000), {
    segmentIndex: 1,
    segment: recording.segments[1],
    sourcePositionMs: 5_000,
  });
  assert.equal(quranRecordingSourceAt(recording, 12_500)?.sourcePositionMs, 7_500);
  assert.equal(quranRecordingSourceAt(recording, recording.durationMs), null);
});

test("binding updated or cleared recordings does not request a nested canvas render", () => {
  let renderRequests = 0;
  const services = {
    requestRender: () => {
      renderRequests += 1;
    },
  } as unknown as WorkflowPluginServices;
  const playback = new QuranRecordingPlaybackController();

  playback.bind("node", recording, services);
  playback.bind("node", { ...recording, updatedAt: recording.updatedAt + 1 }, services);
  playback.bind("node", null, services);
  playback.bind("node", null, services);

  assert.equal(renderRequests, 0);
  assert.equal(playback.state("node").playheadMs, 0);
  playback.dispose();
});
