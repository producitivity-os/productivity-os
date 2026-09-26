import assert from "node:assert/strict";
import test from "node:test";

import { CanvasTabCache } from "../src/components/canvas-tab-cache.ts";
import {
  updateWorkflowSummaryTitle,
  updateWorkflowTabTitle,
} from "../src/data/workflow-title-state.ts";

test("keeps the current and most recently selected canvas surfaces", () => {
  const cache = new CanvasTabCache(2);
  cache.select("one");
  const one = cache.target()!;
  cache.markReady(one.key);
  cache.select("two");
  cache.markReady(cache.target()!.key);
  cache.select("three");
  assert.deepEqual(cache.entries().map((entry) => entry.canvasId), ["three", "two"]);
});

test("does not activate a stale or evicted canvas load", () => {
  const cache = new CanvasTabCache(2);
  cache.select("one");
  const one = cache.target()!;
  cache.markReady(one.key);
  cache.select("two");
  const two = cache.target()!;
  cache.select("three");
  assert.equal(cache.markReady(two.key), false);
  assert.equal(cache.displayed()?.canvasId, "one");
  assert.equal(cache.isLoading(), true);
});

test("switches cached canvases immediately and revisions retry cleanly", () => {
  const cache = new CanvasTabCache(2);
  cache.select("one");
  cache.markReady(cache.target()!.key);
  cache.select("two");
  cache.markReady(cache.target()!.key);
  cache.select("one");
  assert.equal(cache.isLoading(), false);
  assert.equal(cache.displayed()?.canvasId, "one");
  const previousKey = cache.target()!.key;
  cache.retry("one");
  assert.notEqual(cache.target()!.key, previousKey);
  assert.equal(cache.isLoading(), true);
  assert.equal(cache.markReady(previousKey), false);
  assert.equal(cache.isLoading(), true);
});

test("unchanged workflow titles preserve parent state identity", () => {
  const records = [{ id: "one", title: "One", revision: 2 }];
  const tabs = [{ id: "one", label: "One" }];

  assert.equal(updateWorkflowSummaryTitle(records, "one", "One"), records);
  assert.equal(
    updateWorkflowTabTitle(tabs, "one", "One", () => ({
      id: "one",
      label: "One",
    })),
    tabs,
  );

  const renamedRecords = updateWorkflowSummaryTitle(records, "one", "Renamed");
  const renamedTabs = updateWorkflowTabTitle(tabs, "one", "Renamed", () => ({
    id: "one",
    label: "Renamed",
  }));
  assert.equal(renamedRecords[0].title, "Renamed");
  assert.equal(renamedTabs[0].label, "Renamed");
  assert.notEqual(renamedRecords, records);
  assert.notEqual(renamedTabs, tabs);
});
