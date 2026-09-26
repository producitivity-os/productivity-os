import assert from "node:assert/strict";
import test from "node:test";
import {
  createWaterData,
  formatWaterProgress,
  migrateWaterData,
  nextWaterIntake,
} from "../../../plugins/workflows/health-nodes/water.ts";

test("water nodes migrate to a validated 100 ml increment", () => {
  const fresh = createWaterData("2026-09-21");
  assert.equal(fresh.incrementMilliliters, 100);
  assert.equal(migrateWaterData({ incrementMilliliters: 250 }, fresh.localDate).incrementMilliliters, 250);
  assert.equal(migrateWaterData({ incrementMilliliters: 0 }, fresh.localDate).incrementMilliliters, 1);
  assert.equal(migrateWaterData({ incrementMilliliters: 9_000 }, fresh.localDate).incrementMilliliters, 2_000);
  assert.equal(migrateWaterData({ incrementMilliliters: 2.5 }, fresh.localDate).incrementMilliliters, 100);
});

test("water progress uses readable milliliter/liter copy", () => {
  assert.equal(formatWaterProgress({ intakeMilliliters: 0, targetMilliliters: 2_000 }), "0 ml of 2 L");
  assert.equal(formatWaterProgress({ intakeMilliliters: 100, targetMilliliters: 2_000 }), "100 ml of 2 L");
  assert.equal(formatWaterProgress({ intakeMilliliters: 2_000, targetMilliliters: 2_000 }), "2 L goal reached");
});

test("water decrements stop at zero", () => {
  assert.equal(nextWaterIntake(50, -100), 0);
  assert.equal(nextWaterIntake(100, 100), 200);
});
