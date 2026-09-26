import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Workflows owns its native identity and larger default window size", () => {
  const config = JSON.parse(
    readFileSync(
      new URL("../src-tauri/tauri.conf.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(config.productName, "Workflows");
  assert.equal(config.identifier, "com.productivity-os.workflows");
  assert.equal(config.app.windows[0].width, 1200);
  assert.equal(config.app.windows[0].height, 800);
  assert.notEqual(config.app.windows[0].maximized, true);
});
