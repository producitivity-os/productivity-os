import assert from "node:assert/strict";
import test from "node:test";
import { Container, Graphics } from "pixi.js";
import {
  WorkflowNodeButton,
  WorkflowNodeProgressBar,
  WorkflowNodeWaveform,
  clampWorkflowNodeProgress,
  normalizeWorkflowNodeWaveformPeak,
  setWorkflowNodeButtonIconRenderer,
} from "../../../packages/workflow-plugin-sdk/src/index.ts";

type TestNode = { id: string; width: number; disabled: boolean; completed: boolean; progress: number };

test("workflow node buttons own regions, disabled clicks, hover rendering, and custom icons", () => {
  let presses = 0;
  let customRenders = 0;
  let renderedDisabled = false;
  const button = new WorkflowNodeButton<TestNode, { allowed: boolean }, number>({
    id: "test:button",
    bounds: (node) => ({ x: node.width - 36, y: 2, width: 34, height: 34 }),
    icon: "check",
    disabled: (node) => node.disabled,
    completed: (node) => node.completed,
    theme: {
      background: 0xffffff,
      border: 0x111111,
      foreground: 0x222222,
      hoverBackground: 0xeeeeee,
      hoverBorder: 0x8665f6,
      disabledAlpha: 0.4,
      completedBackground: 0x8665f6,
      completedForeground: 0xffffff,
    },
    renderIcon(target, state) {
      customRenders += Number(state.hovered);
      renderedDisabled = state.disabled;
      target.addChild(new Graphics().circle(state.bounds.x, state.bounds.y, 1).fill({ color: state.theme.foreground }));
    },
    onPress({ services }) {
      if (services.allowed) presses += 1;
      return presses;
    },
  });
  const node = { id: "one", width: 100, disabled: false, completed: false, progress: 0 };
  assert.deepEqual(button.interactionRegion(node), {
    id: "test:button",
    bounds: { x: 64, y: 2, width: 34, height: 34 },
    cursor: "pointer",
  });
  const target = new Container();
  button.render(target, node, { hoveredRegionId: "test:button" });
  assert.equal(target.children.length, 2);
  assert.equal(customRenders, 1);
  button.render(new Container(), node, { disabled: true, hoveredRegionId: "test:button" });
  assert.equal(renderedDisabled, true);
  assert.equal(customRenders, 1);
  assert.equal(button.press(node, "test:button", "workflow", { allowed: true }), 1);
  assert.equal(button.interactionRegion(node, { disabled: true })?.cursor, "default");
  assert.equal(
    button.press(node, "test:button", "workflow", { allowed: true }, { disabled: true }),
    undefined,
  );
  assert.equal(presses, 1);
  node.disabled = true;
  assert.equal(button.interactionRegion(node)?.cursor, "default");
  assert.equal(button.press(node, "test:button", "workflow", { allowed: true }), undefined);
  assert.equal(presses, 1);

  let customButtonRenders = 0;
  node.disabled = false;
  node.completed = true;
  new WorkflowNodeButton<TestNode, object>({
    id: "custom",
    bounds: { x: 0, y: 0, width: 20, height: 20 },
    icon: "check",
    completed: (value) => value.completed,
    theme: { background: 0, border: 0, foreground: 0, completedForeground: 0xffffff },
    render(customTarget, state) {
      assert.equal(state.completed, true);
      customButtonRenders += 1;
      customTarget.addChild(new Graphics());
    },
  }).render(target, node, {});
  assert.equal(customButtonRenders, 1);
});

test("workflow waveforms clamp peaks and positions and render empty and played states", () => {
  const node: TestNode & { peaks: number[] } = {
    id: "waveform",
    width: 120,
    disabled: false,
    completed: false,
    progress: 1.5,
    peaks: [-1, 0.25, 2, Number.NaN],
  };
  const waveform = new WorkflowNodeWaveform<typeof node>({
    id: "test:waveform",
    bounds: (value) => ({ x: 10, y: 4, width: value.width - 20, height: 20 }),
    peaks: (value) => value.peaks,
    progress: (value) => value.progress,
    theme: {
      background: 0xede9fe,
      wave: 0xa78bfa,
      playedWave: 0x7c3aed,
      playhead: 0x5b21b6,
      emptyWave: 0xc4b5fd,
    },
  });
  assert.deepEqual(waveform.interactionRegion(node), {
    id: "test:waveform",
    bounds: { x: 10, y: 4, width: 100, height: 20 },
    cursor: "ew-resize",
  });
  assert.equal(waveform.interactionRegion(node, { disabled: true }).cursor, "default");
  assert.equal(waveform.position(node, -20), 0);
  assert.equal(waveform.position(node, 60), 0.5);
  assert.equal(waveform.position(node, 200), 1);
  const populated = new Container();
  waveform.render(populated, node);
  assert.ok(populated.children.length >= 4);
  node.peaks = [];
  const empty = new Container();
  waveform.render(empty, node, { disabled: true });
  assert.ok(empty.children.length >= 4);
  assert.ok(empty.children[0].alpha < 1);
  assert.equal(normalizeWorkflowNodeWaveformPeak(-2), 1);
  assert.equal(normalizeWorkflowNodeWaveformPeak(Number.NaN), 0);
  waveform.dispose();
});

test("workflow hosts can supply approved SVG-backed icon rendering", () => {
  let renderedIcon = "";
  setWorkflowNodeButtonIconRenderer((target, state) => {
    renderedIcon = state.icon;
    target.addChild(new Graphics());
    return true;
  });
  try {
    const button = new WorkflowNodeButton<TestNode, object>({
      id: "host-icon",
      bounds: { x: 0, y: 0, width: 24, height: 24 },
      icon: "play",
      theme: { background: 0, border: 0, foreground: 0xffffff },
    });
    const target = new Container();
    button.render(
      target,
      { id: "icon", width: 24, disabled: false, completed: false, progress: 0 },
      {},
    );
    assert.equal(renderedIcon, "play");
    assert.equal(target.children.length, 2);
  } finally {
    setWorkflowNodeButtonIconRenderer(null);
  }
});

test("workflow progress bars clamp values, render rounded surfaces, and dispose state", () => {
  const node: TestNode = { id: "progress", width: 120, disabled: false, completed: false, progress: 0.25 };
  const progress = new WorkflowNodeProgressBar<TestNode>({
    id: "test:progress",
    bounds: (value) => ({ x: 0, y: 0, width: value.width, height: 40 }),
    value: (value) => value.progress,
    theme: { track: 0xffffff, fill: 0x8665f6, invertedForeground: 0xffffff },
    radius: 20,
    animationDurationMs: 300,
  });
  const target = new Container();
  const animationHost = globalThis as typeof globalThis & {
    requestAnimationFrame?: (callback: FrameRequestCallback) => number;
  };
  const previousAnimationFrame = animationHost.requestAnimationFrame;
  animationHost.requestAnimationFrame = () => 1;
  try {
    assert.equal(progress.value(node), 0.25);
    assert.equal(progress.render(target, node, 1_000), 0.25);
    assert.ok(target.children.length >= 3);
    node.progress = 0.75;
    assert.equal(progress.render(target, node, 1_100), 0.25);
    const animated = progress.render(target, node, 1_250);
    assert.ok(animated > 0.25 && animated < 0.75);
    assert.equal(progress.render(target, node, 1_400), 0.75);
    node.progress = 2;
    assert.equal(progress.value(node), 1);
    progress.renderContent(target, node, {}, (content) => content.addChild(new Graphics()), 1_450);
    progress.dispose(node.id);
    assert.equal(progress.render(target, node, 1_500), 1);
    progress.dispose();
  } finally {
    if (previousAnimationFrame) animationHost.requestAnimationFrame = previousAnimationFrame;
    else delete animationHost.requestAnimationFrame;
  }
  assert.equal(clampWorkflowNodeProgress(-1), 0);
  assert.equal(clampWorkflowNodeProgress(Number.NaN), 0);
  assert.equal(clampWorkflowNodeProgress(1.5), 1);
});
