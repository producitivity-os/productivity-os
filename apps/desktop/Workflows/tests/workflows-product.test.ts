import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("the Canvas desktop product is renamed to Workflows with compatibility scripts", () => {
  const rootPackage = JSON.parse(
    readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
  ) as { scripts: Record<string, string> };
  assert.equal(existsSync(new URL("../../canvas", import.meta.url)), false);
  assert.match(rootPackage.scripts["workflows:build"], /workspace workflows/);
  assert.equal(rootPackage.scripts["canvas:build"], "yarn workflows:build");
  assert.equal(rootPackage.scripts["canvas:test"], "yarn workflows:test");
});

test("Workflows and Notes consume shared library, sidebar, and canvas toolbar UI", () => {
  const workflowIndex = readFileSync(
    new URL("../src/pages/Index.tsx", import.meta.url),
    "utf8",
  );
  const workflowSidebar = readFileSync(
    new URL("../src/components/app-side.tsx", import.meta.url),
    "utf8",
  );
  const workflowDetail = readFileSync(
    new URL("../src/pages/Detail.tsx", import.meta.url),
    "utf8",
  );
  const notesDetail = readFileSync(
    new URL("../../Notes/src/pages/NotebookDetail.tsx", import.meta.url),
    "utf8",
  );
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const media = readFileSync(
    new URL("../src/pages/Media.tsx", import.meta.url),
    "utf8",
  );

  assert.match(workflowIndex, /WorkspaceLibraryShell/);
  assert.match(workflowIndex, /WorkspaceLibraryToolbar/);
  assert.match(workflowSidebar, /WorkspaceSidebarSection/);
  assert.match(workflowDetail, /CanvasToolbar/);
  assert.match(notesDetail, /CanvasToolbar/);
  assert.match(workflowDetail, /CanvasSurfaceContextMenu/);
  assert.match(media, /WorkspaceMediaLibrary/);
  assert.match(app, /Navigate to="\/media" replace/);
  assert.doesNotMatch(notesDetail, /NotesToolbar/);
});

test("Workflows rejects non-workflow documents without rewriting them", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const detail = readFileSync(
    new URL("../src/pages/Detail.tsx", import.meta.url),
    "utf8",
  );
  assert.match(app, /record\.canvasType === "workflow"/);
  assert.match(detail, /stored\.canvasType !== "workflow"/);
  assert.match(detail, /throw new Error\("Workflow not found\."\)/);
});

test("workflow loading is isolated from observer callback identity", () => {
  const detail = readFileSync(
    new URL("../src/pages/Detail.tsx", import.meta.url),
    "utf8",
  );
  const tabHost = readFileSync(
    new URL("../src/components/canvas-tab-host.tsx", import.meta.url),
    "utf8",
  );

  assert.match(detail, /onTitleChangeRef\.current\(canvasId, nextCanvas\.title\)/);
  assert.match(detail, /onLoadErrorRef\.current\?\.\(canvasId, error, surfaceKey\)/);
  assert.doesNotMatch(
    detail,
    /\}, \[onLoadError, onTitleChange, reportError, canvasId\]\);/,
  );
  assert.match(tabHost, /onReady=\{markReady\}/);
  assert.match(tabHost, /onLoadError=\{handleLoadError\}/);
  assert.doesNotMatch(tabHost, /onReady=\{\(\) => markReady/);
  assert.doesNotMatch(tabHost, /onLoadError=\{\(_/);
});
