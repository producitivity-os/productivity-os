import { bookCoverUrl, workflowPluginsData } from "../api/workflow-plugins-data.ts";
import type { WorkflowPluginServices } from "./workflow-plugin-api.tsx";

let bookCache: import("../api/workflow-plugins-data.ts").BookEntity[] = [];
let quranRecordingCache: import("../api/workflow-plugins-data.ts").QuranRecording[] = [];

export const workflowPluginServices: WorkflowPluginServices = {
  listBooks: async () => {
    bookCache = await workflowPluginsData.books();
    return bookCache;
  },
  resolveBook: (cardId) => bookCache.find((book) => book.cardId === cardId) ?? null,
  getPreference: (pluginId, key) => workflowPluginsData.getPreference(pluginId, key),
  setPreference: (pluginId, key, value) => workflowPluginsData.setPreference(pluginId, key, value),
  launchQuranRevision: (input) => workflowPluginsData.launchQuranRevision(input),
  listQuranRecordings: async (workflowId, nodeId) => {
    quranRecordingCache = await workflowPluginsData.quranRecordings(workflowId, nodeId);
    return quranRecordingCache;
  },
  resolveQuranRecording: (id) => quranRecordingCache.find((recording) => recording.id === id) ?? null,
  quranRecordingUrl: (mediaId) => `media://localhost/${encodeURIComponent(mediaId)}/content`,
  cacheQuranRecordingSegmentPeaks: (segmentId, waveformPeaks) =>
    workflowPluginsData.cacheQuranRecordingSegmentPeaks(segmentId, waveformPeaks),
  requestRender: () => window.dispatchEvent(new Event("workflow-plugin-render-request")),
  bookCoverUrl,
  healthWaterDay: (localDate) => workflowPluginsData.healthWaterDay(localDate),
  saveHealthWater: (input) => workflowPluginsData.saveHealthWater(input),
  nutritionWaterDay: (localDate) => workflowPluginsData.nutritionWaterDay(localDate),
  saveNutritionWater: (input) => workflowPluginsData.saveNutritionWater(input),
  listNutritionFood: (localDate) => workflowPluginsData.nutritionFood(localDate),
  saveNutritionFood: (input) => workflowPluginsData.saveNutritionFood(input),
  listRevisionNotebooks: () => workflowPluginsData.revisionNotebooks(),
  revisionSession: (id) => workflowPluginsData.revisionSession(id),
  launchRevisionSession: (input) => workflowPluginsData.launchRevisionSession(input),
  setRevisionSessionStatus: (id, status) => workflowPluginsData.setRevisionSessionStatus(id, status),
};
