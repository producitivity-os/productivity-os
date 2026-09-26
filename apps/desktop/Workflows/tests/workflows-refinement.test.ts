import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getValidArrowHour,
  getValidArrowMinuteOrSecond,
  getValidHour,
  getValidMinuteOrSecond,
} from "../../../packages/shared-ui/src/components/time-picker-utils.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("shared time inputs clamp and wrap Timer duration segments", () => {
  assert.equal(getValidHour("25"), "23");
  assert.equal(getValidMinuteOrSecond("74"), "59");
  assert.equal(getValidArrowHour("23", 1), "00");
  assert.equal(getValidArrowMinuteOrSecond("00", -1), "59");
  const picker = read("../../../packages/shared-ui/src/components/duration-picker.tsx");
  const properties = read("../src/components/workflow-properties-panel.tsx");
  assert.match(picker, /minMs = 60_000/);
  assert.match(picker, /maxMs = 3 \* 60 \* 60_000/);
  assert.match(properties, /<DurationPicker/);
});

test("Workflows hides layers and completed properties and supports project classification", () => {
  const sidebar = read("../src/components/canvas-sidebar.tsx");
  const fields = read("../src/features/workflow/nodes/properties.ts");
  const dialog = read("../src/components/canvas-properties-dialog.tsx");
  const migration = read("../../../crates/database/migrations/202609090001_add_workflow_kind_and_reminders.sql");
  assert.doesNotMatch(sidebar, />Layers</);
  assert.doesNotMatch(fields, /\| "completed"/);
  assert.match(dialog, /value="project">Project/);
  assert.match(migration, /workflow_kind TEXT NOT NULL DEFAULT 'workflow'/);
});

test("task subtasks are edited inside the node and any Start-connected node can execute", () => {
  const properties = read("../src/components/workflow-properties-panel.tsx");
  const overlay = read("../src/features/workflow/nodes/task/overlay.tsx");
  const renderer = read("../src/features/workflow/nodes/task/renderer.ts");
  const progression = read("../src/features/workflow/nodes/progression.ts");
  assert.doesNotMatch(properties, /Add subtask|workflow-subtask-list|SubtaskControl/);
  assert.match(overlay, /GripVertical/);
  assert.match(overlay, /workflow-task-node-checkbox/);
  assert.match(overlay, /const name = event\.currentTarget\.value/);
  assert.match(renderer, /\.moveTo\(0, 40\)/);
  assert.match(renderer, /\.lineTo\(task\.width, 40\)/);
  assert.match(renderer, /if \(task\.subtasksCollapsed\) return/);
  assert.match(overlay, /className="workflow-task-node-overlay"/);
  const styles = read("../src/App.css");
  assert.match(styles, /\.workflow-task-node-subtask[^}]*padding: 0 8px 0 16px/);
  assert.match(styles, /\.workflow-task-node-subtask > input[^}]*color: transparent/);
  assert.match(progression, /workflowEntryNodes\(objects\)/);
});

test("Project workflows and Reminders synchronize the full task lifecycle", () => {
  const detail = read("../src/pages/Detail.tsx");
  const data = read("../src/api/canvas-data.ts");
  const native = read("../src-tauri/src/lib.rs");
  assert.match(detail, /syncProjectReminderNodes/);
  assert.match(detail, /nextCanvas\.workflowKind === "project"/);
  assert.match(detail, /sourceReminderId: reminder\.id/);
  assert.match(detail, /createProjectReminder/);
  assert.match(detail, /updateProjectReminder/);
  assert.match(detail, /deleteProjectReminder/);
  assert.match(detail, /restoreProjectReminder/);
  assert.match(detail, /handle\.removeObjects\(remotelyRemovedNodeIds\)/);
  assert.match(detail, /window\.setInterval\(\(\) => void refresh\(\), 3_000\)/);
  assert.match(data, /projectReminders\(projectId: string\)/);
  assert.match(data, /createProjectReminder\(input: ProjectReminderCreate\)/);
  assert.match(data, /updateProjectReminder\(input: ProjectReminderUpdate\)/);
  assert.match(data, /deleteProjectReminder\(projectId: string, id: string\)/);
  assert.match(data, /restoreProjectReminder\(input: ProjectReminderUpdate\)/);
  assert.match(native, /async fn list_project_reminders/);
  assert.match(native, /async fn create_project_reminder/);
  assert.match(native, /async fn update_project_reminder/);
  assert.match(native, /async fn delete_project_reminder/);
  assert.match(native, /async fn restore_project_reminder/);
});

test("the node drawer uses draggable node previews and Workflows uses compact flow chrome", () => {
  const sidebar = read("../src/components/canvas-sidebar.tsx");
  const detail = read("../src/pages/Detail.tsx");
  const renderer = read("../src/features/workflow/nodes/renderer.ts");
  const extension = read("../src/features/workflow/nodes/canvas-extension.ts");
  const taskInteractions = read("../src/features/workflow/nodes/task/interactions.ts");
  const properties = read("../src/components/workflow-properties-panel.tsx");
  assert.match(sidebar, /WorkflowNodeTrayPreview/);
  assert.match(sidebar, /draggable/);
  assert.match(sidebar, /writeWorkflowNodeDrag/);
  assert.match(detail, /gridStyle: "dots"/);
  assert.match(detail, /strokeWidth: 4/);
  assert.match(detail, /renderMode: "under"/);
  assert.match(detail, /endHead: "none"/);
  const defaults = read("../src/data/canvas-defaults.ts");
  assert.match(defaults, /arrow\.strokeWidth = 4/);
  assert.match(defaults, /arrow\.renderMode = "under"/);
  assert.match(renderer, /renderWorkflowRunningPulse/);
  assert.doesNotMatch(renderer, /node\.active/);
  assert.match(extension, /taskInteractionRegions/);
  assert.match(taskInteractions, /task:toggle-subtasks/);
  assert.doesNotMatch(properties, /label="Description"/);
});

test("Timers use blue progress, region hover, sounds, and Start reachability", () => {
  const renderer = read("../src/features/workflow/nodes/timer/renderer.ts");
  const timer = read("../src/features/workflow/nodes/timer/lifecycle.ts");
  const theme = read("../src/features/workflow/nodes/timer/theme.ts");
  const sounds = read("../src/features/workflow/controllers/sound-controller.ts");
  const progression = read("../src/features/workflow/nodes/progression.ts");
  assert.match(renderer, /new WorkflowNodeProgressBar/);
  assert.match(renderer, /timerProgressBar\.renderContent/);
  assert.match(renderer, /timerButton\.render/);
  assert.match(timer, /new WorkflowNodeButton/);
  assert.match(timer, /timer:toggle/);
  assert.match(theme, /fill: workflowNodeTheme\.blue/);
  assert.match(theme, /invertedForeground: workflowNodeTheme\.white/);
  assert.match(sounds, /next\.status === "running"/);
  assert.match(sounds, /next\.status === "paused"/);
  assert.match(sounds, /this\.ringCompletion\(\)/);
  assert.match(sounds, /this\.tickSeconds/);
  assert.match(progression, /reachableWorkflowNodeIds/);
  assert.match(progression, /workflowEntryNodes\(objects\)/);
  assert.doesNotMatch(
    progression.match(/export function workflowNodeCanExecute[\s\S]*?\n\}/)?.[0] ?? "",
    /node\.active/,
  );
});

test("Workflows refreshes externally created project summaries when it becomes visible", () => {
  const app = read("../src/App.tsx");
  assert.match(app, /const refreshCanvasSummaries = \(\) =>/);
  assert.match(app, /canvasData\.list\(\)/);
  assert.match(app, /window\.addEventListener\("focus", refreshCanvasSummaries\)/);
  assert.match(app, /document\.addEventListener\("visibilitychange", onVisibilityChange\)/);
});

test("tabs reorder at neighbor midpoints and animate displaced tabs", () => {
  const header = read("../../../packages/shared-ui/src/components/app-header.tsx");
  assert.match(header, /center < bounds\.left \+ bounds\.width \/ 2/);
  assert.match(header, /center > bounds\.left \+ bounds\.width \/ 2/);
  assert.match(header, /node\.animate\(/);
  assert.match(header, /duration: 150/);
});
