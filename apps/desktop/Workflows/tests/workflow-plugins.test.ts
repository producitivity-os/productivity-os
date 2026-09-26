import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { QURAN_SURAHS } from "../../../plugins/workflows/quran-nodes/surahs.ts";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

test("bundled workflow plugins are default-installed and discovered by Vite", () => {
  const registry = read("../src/plugins/workflow-plugin-registry.ts");
  const migration = read(
    "../../../crates/database/migrations/202609080001_create_workflow_plugins.sql",
  );
  assert.match(registry, /plugins\/workflows\/\*\/index\.tsx/);
  assert.doesNotMatch(registry, /"glob" in import\.meta/);
  assert.match(migration, /workflows\.quran-nodes/);
  assert.match(migration, /workflows\.book-nodes/);
  for (const path of [
    "../../../plugins/workflows/quran-nodes/manifest.json",
    "../../../plugins/workflows/book-nodes/manifest.json",
    "../../../plugins/workflows/health-nodes/manifest.json",
    "../../../plugins/workflows/revise-nodes/manifest.json",
  ]) {
    const manifest = JSON.parse(read(path)) as {
      defaultInstalled: boolean;
      app: {
        id: string;
        name: string;
        icon: string;
        palette?: Record<string, string>;
      };
    };
    assert.equal(manifest.defaultInstalled, true);
    assert.ok(manifest.app.id);
    assert.ok(manifest.app.name);
    assert.ok(manifest.app.icon);
    assert.deepEqual(Object.keys(manifest.app.palette ?? {}).sort(), [
      "border",
      "foreground",
      "mutedForeground",
      "surface",
    ]);
  }
});

test("the plugin library groups searchable plugins by their owning app", () => {
  const page = read("../src/pages/Plugins.tsx");
  const contract = read("../../../packages/workflow-plugin-sdk/src/index.ts");
  assert.match(contract, /app:\s*\{/);
  assert.match(contract, /launchTarget\?: string/);
  assert.match(contract, /export type WorkflowPluginPalette/);
  assert.match(
    contract,
    /NodePickerPreview\?: React\.ComponentType<WorkflowNodePickerPreviewProps>/,
  );
  assert.match(contract, /onTick\?/);
  assert.match(page, /plugin\.manifest\.app\.id/);
  assert.match(page, /Search apps, plugins, and nodes/);
  assert.match(page, /plugin\.nodes\.map/);
  assert.match(page, /workflow-plugin-marketplace-previews/);
  assert.match(page, /const Preview = node\.NodePickerPreview/);
  assert.match(page, /<Preview palette=\{palette\} \/>/);
});

test("the node picker renders faithful plugin previews with a palette-aware fallback", () => {
  const sidebar = read("../src/components/canvas-sidebar.tsx");
  const styles = read("../src/App.css");
  assert.match(sidebar, /const Preview = definition\.NodePickerPreview/);
  assert.match(sidebar, /<Preview palette=\{palette\} \/>/);
  assert.match(sidebar, /<WorkflowNodeTrayPreview kind="plugin"/);
  assert.match(
    sidebar,
    /draggable aria-label=\{`Add \$\{definition\.title\}`\}/,
  );
  assert.match(styles, /\.workflow-plugin-node-preview/);
  assert.match(styles, /--workflow-plugin-surface/);
  assert.match(styles, /--workflow-plugin-border/);
  assert.match(styles, /pointer-events: none/);
});

test("Books supplies maroon-progress Reading Log and Read Book timer nodes", () => {
  const plugin = read("../../../plugins/workflows/book-nodes/index.tsx");
  const manifest = JSON.parse(
    read("../../../plugins/workflows/book-nodes/manifest.json"),
  ) as {
    app: {
      name: string;
      launchTarget: string;
      palette: Record<string, string>;
    };
  };
  assert.equal(manifest.app.name, "Books");
  assert.equal(manifest.app.launchTarget, "notes");
  assert.equal(manifest.app.palette.surface, "#ffffff");
  assert.equal(manifest.app.palette.border, "#cbd5e1");
  assert.match(plugin, /NodePickerPreview: ReadingLogPreview/);
  assert.match(plugin, /nodeType: "read-book"/);
  assert.match(plugin, /title: "Read Book"/);
  assert.match(plugin, /NodePickerPreview: ReadBookPreview/);
  assert.match(plugin, /durationMs: 25 \* 60_000/);
  assert.match(plugin, /status: "running"/);
  assert.match(plugin, /status: "paused"/);
  assert.match(plugin, /status: "completed"/);
  assert.match(plugin, /onTick\(node, now\)/);
  assert.match(plugin, /readBookElapsed\(data, now\) < data\.durationMs/);
  assert.match(plugin, /play-1003-svgrepo-com\.svg/);
  assert.match(plugin, /new WorkflowNodeButton/);
  assert.match(plugin, /new WorkflowNodeProgressBar/);
  assert.match(plugin, /data\.status === "running"\s*\?\s*"pause"/);
  assert.match(plugin, /data\.status === "completed"\s*\?\s*"reset"/);
  assert.match(plugin, /roundRect\(0, 0, node\.width, node\.height, 20\)/);
});

test("Nutrition supplies bright-blue-progress food and water logging nodes", () => {
  const plugin = read("../../../plugins/workflows/health-nodes/index.tsx");
  const water = read("../../../plugins/workflows/health-nodes/water.ts");
  const manifest = JSON.parse(
    read("../../../plugins/workflows/health-nodes/manifest.json"),
  ) as {
    name: string;
    app: {
      name: string;
      launchTarget: string;
      palette: Record<string, string>;
    };
  };
  assert.equal(manifest.name, "Nutrition Nodes");
  assert.equal(manifest.app.name, "Nutrition");
  assert.equal(manifest.app.launchTarget, "nutrition");
  assert.equal(manifest.app.palette.surface, "#ffffff");
  assert.equal(manifest.app.palette.border, "#cbd5e1");
  assert.match(plugin, /nodeType: "food"/);
  assert.match(plugin, /title: "Log Food"/);
  assert.match(plugin, /mealName: "Sandwich"/);
  assert.match(plugin, /saveNutritionFood/);
  assert.match(plugin, /Ate 1 \$\{data\.mealName\}/);
  assert.match(plugin, /pendingFoodNodes/);
  assert.match(plugin, /nodeType: "water"/);
  assert.match(plugin, /title: "Log Water"/);
  assert.match(plugin, /waterButton\("decrement"\)/);
  assert.match(plugin, /waterButton\("increment"\)/);
  assert.doesNotMatch(plugin, /workflow-plugin-inline-actions/);
  assert.match(plugin, /schemaVersion: 4/);
  assert.match(plugin, /defaultSize: \{ width: 280, height: 56 \}/);
  assert.match(
    plugin,
    /outlineRadius: \(node\) => healthNodeTheme\.waterRadius\(node\.height\)/,
  );
  assert.match(plugin, /migrateNode: \(node, fromVersion\)/);
  assert.match(plugin, /y: node\.y \+ \(node\.height - height\) \/ 2/);
  assert.match(water, /DEFAULT_WATER_INCREMENT_MILLILITERS = 100/);
  assert.match(plugin, /max=\{2_000\}/);
  assert.match(plugin, /formatWaterProgress/);
  assert.match(plugin, /new WorkflowNodeProgressBar/);
  assert.match(plugin, /animationDurationMs: 300/);
  assert.match(
    read("../../../plugins/workflows/health-nodes/theme.ts"),
    /waterRadius: \(height: number\) => height \/ 2/,
  );
  assert.match(water, /Math\.max\(0, current \+ delta\)/);
  assert.match(plugin, /pendingWaterNodes/);
  assert.match(plugin, /plus\.svg/);
  assert.match(plugin, /minus\.svg/);
  assert.match(read("../src/assets/svg/plus.svg"), /stroke="#FFFFFF"/);
  assert.match(read("../src/assets/svg/minus.svg"), /stroke="#FFFFFF"/);
});

test("Quran and Review nodes provide identifying picker previews", () => {
  const quran = read("../../../plugins/workflows/quran-nodes/index.tsx");
  const review = read("../../../plugins/workflows/revise-nodes/index.tsx");
  assert.match(quran, /NodePickerPreview: QuranPreview/);
  assert.match(quran, /Quran revision/);
  assert.match(quran, /schemaVersion: 3/);
  assert.match(quran, /new WorkflowNodeWaveform/);
  assert.match(quran, /circle\.svg/);
  assert.match(quran, /replaceStartMs/);
  assert.match(quran, /onPointerGesture/);
  assert.doesNotMatch(quran, /Click to record/);
  assert.match(review, /NodePickerPreview: ReviewPreview/);
  assert.match(review, /title: "Review"/);
});

test("plugin nodes share the Timer surface with app-specific solid progress", () => {
  const cases = [
    ["../../../plugins/workflows/revise-nodes/theme.ts", "f97316"],
    ["../../../plugins/workflows/book-nodes/theme.ts", "8b2f2f"],
    ["../../../plugins/workflows/quran-nodes/theme.ts", "7c3aed"],
    ["../../../plugins/workflows/health-nodes/theme.ts", "0ea5e9"],
  ] as const;
  for (const [path, accent] of cases) {
    const theme = read(path);
    assert.match(theme, /surface: 0xffffff/);
    assert.match(theme, /border: 0xcbd5e1/);
    assert.match(theme, /track: 0xffffff/);
    assert.match(theme, new RegExp(`fill: 0x${accent}`));
    assert.match(theme, /invertedForeground: 0xffffff/);
    assert.doesNotMatch(theme, /fillAlpha:/);
  }
  for (const path of [
    "../../../plugins/workflows/revise-nodes/index.tsx",
    "../../../plugins/workflows/book-nodes/index.tsx",
    "../../../plugins/workflows/quran-nodes/index.tsx",
    "../../../plugins/workflows/health-nodes/index.tsx",
  ]) {
    assert.match(read(path), /\.renderContent\(/);
  }
});

test("Quran Nodes bundles valid metadata for all 114 Surahs", () => {
  assert.equal(QURAN_SURAHS.length, 114);
  assert.deepEqual(QURAN_SURAHS[0], {
    number: 1,
    name: "Al-Fatihah",
    ayahCount: 7,
  });
  assert.deepEqual(QURAN_SURAHS[113], {
    number: 114,
    name: "An-Nas",
    ayahCount: 6,
  });
});

test("Quran is the recorder target and managed Media accepts audio", () => {
  const recorder = read("../../Quran/src/features/recitation/RecitationSession.tsx");
  const nativeRecorder = read("../../Quran/src-tauri/src/lib.rs");
  const nativeWorkflows = read("../src-tauri/src/lib.rs");
  const app = JSON.parse(read("../../Quran/src-tauri/tauri.conf.json")) as {
    identifier: string;
    build: { devUrl: string };
  };
  const audioMigration = read(
    "../../../crates/database/migrations/202609070001_add_audio_media_kind.sql",
  );
  assert.equal(app.identifier, "com.productivity-os.quran");
  assert.equal(app.build.devUrl, "http://localhost:1450");
  assert.match(recorder, /getUserMedia\(\{ audio: true \}\)/);
  assert.match(nativeRecorder, /append_recording_chunk/);
  assert.match(nativeRecorder, /import_media_path_data/);
  assert.match(nativeRecorder, /mime_type: session\.mime_type/);
  assert.match(nativeWorkflows, /AppActivity::QuranCapture/);
  assert.match(nativeWorkflows, /create_quran_capture_request/);
  assert.match(nativeWorkflows, /publish_app_activity/);
  assert.doesNotMatch(nativeWorkflows, /fn launch_quran_app/);
  assert.match(audioMigration, /'audio'/);
});

test("Revise Nodes persists and synchronizes goal-based revision sessions", () => {
  const plugin = read("../../../plugins/workflows/revise-nodes/index.tsx");
  const actions = read("../../../plugins/workflows/revise-nodes/actions.ts");
  const migration = read(
    "../../../crates/database/migrations/202609210001_extend_revision_sessions.sql",
  );
  const service = read("../../../services/data-service/src/lib.rs");
  const revise = read("../../Revise/src/features/review/review-window.tsx");
  const reviseApi = read("../../Revise/src/api/revision-data.ts");
  const nativeWorkflows = read("../src-tauri/src/lib.rs");
  assert.match(plugin, /nodeType: "timed-revision"/);
  assert.match(plugin, /schemaVersion: 3/);
  assert.match(actions, /launchRevisionSession/);
  assert.doesNotMatch(plugin, /DurationPicker/);
  assert.doesNotMatch(plugin, /durationMs/);
  assert.match(plugin, /Complete all due cards/);
  assert.match(plugin, /ALL_DUE_REVIEW_GOAL/);
  assert.match(plugin, /rightCount/);
  assert.match(plugin, /wrongCount/);
  assert.match(plugin, /new WorkflowNodeButton/);
  assert.match(plugin, /new WorkflowNodeProgressBar/);
  assert.match(migration, /CREATE TABLE revision_sessions/);
  assert.match(migration, /CREATE TABLE revision_session_results/);
  assert.match(migration, /'cancelled'/);
  assert.match(service, /InitializeRevisionSession/);
  assert.match(service, /SetRevisionSessionStatus/);
  assert.match(revise, /sessionRun/);
  assert.match(revise, /setSessionStatus/);
  assert.match(revise, /reviewSessionCard/);
  assert.match(reviseApi, /workflowSessionId/);
  assert.match(nativeWorkflows, /AppActivity::ReviseReviewSession/);
  assert.match(nativeWorkflows, /start_revision_session/);
  assert.doesNotMatch(nativeWorkflows, /fn launch_revise_app/);
});

test("Workflows uses constrained draggable tabs and the compact logo-free rail", () => {
  const header = read(
    "../../../packages/shared-ui/src/components/app-header.tsx",
  );
  const sidebar = read("../src/components/canvas-sidebar.tsx");
  const styles = read("../src/App.css");
  assert.match(header, /from "react-draggable"/);
  assert.match(header, /axis="x"/);
  assert.doesNotMatch(sidebar, /aria-label="Workflows"/);
  assert.match(styles, /\.canvas-properties-panel\s*\{[^}]*width: min\(300px/s);
  assert.match(styles, /\.canvas-rail-button\s*\{[^}]*border: 1px solid/s);
});
