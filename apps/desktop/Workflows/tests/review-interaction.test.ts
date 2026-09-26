import assert from "node:assert/strict";
import test from "node:test";
import type {
  RevisionSession,
  WorkflowPluginNode,
  WorkflowPluginServices,
} from "../../../packages/workflow-plugin-sdk/src/index.ts";
import { pressReviewSession } from "../../../plugins/workflows/revise-nodes/actions.ts";
import {
  ALL_DUE_REVIEW_GOAL,
  reviewCardCounts,
  type ReviseNodeData,
} from "../../../plugins/workflows/revise-nodes/model.ts";

const data = (): ReviseNodeData => ({
  goal: { ...ALL_DUE_REVIEW_GOAL },
  notebookId: null,
  notebookTitle: "All notebooks",
  sessionId: null,
  status: "idle",
  elapsedMs: 0,
  startedAt: null,
  totalCards: 0,
  remainingCards: 0,
  reviewedCount: 0,
  rightCount: 0,
  wrongCount: 0,
  results: [],
  sessionUpdatedAt: 0,
});

test("Review node counters expose due, correct, and wrong cards", () => {
  assert.deepEqual(
    reviewCardCounts({ remainingCards: 12, rightCount: 7, wrongCount: 2 }),
    { due: 12, correct: 7, wrong: 2 },
  );
});

test("Review Play launches one session and immediately applies its persisted state", async () => {
  const node = {
    id: "review",
    completed: false,
    pluginData: data(),
  } as WorkflowPluginNode<ReviseNodeData>;
  const session: RevisionSession = {
    id: "session",
    workflowId: "workflow",
    nodeId: node.id,
    notebookId: null,
    goal: { ...ALL_DUE_REVIEW_GOAL },
    elapsedMs: 0,
    status: "running",
    totalCards: 12,
    remainingCards: 12,
    reviewedCount: 0,
    rightCount: 0,
    wrongCount: 0,
    startedAt: 1_000,
    createdAt: 1_000,
    updatedAt: 1_000,
    results: [],
  };
  let launches = 0;
  let launchInput: Parameters<WorkflowPluginServices["launchRevisionSession"]>[0] | null = null;
  const services = {
    async launchRevisionSession(input: Parameters<WorkflowPluginServices["launchRevisionSession"]>[0]) {
      launches += 1;
      launchInput = input;
      return session;
    },
  } as unknown as WorkflowPluginServices;

  const result = await pressReviewSession(node, node.pluginData, "workflow", services);

  assert.equal(launches, 1);
  assert.equal(launchInput?.workflowId, "workflow");
  assert.equal(launchInput?.nodeId, node.id);
  assert.deepEqual(launchInput?.goal, ALL_DUE_REVIEW_GOAL);
  assert.equal(result?.pluginData?.sessionId, session.id);
  assert.equal(result?.pluginData?.status, "running");
  assert.equal(result?.pluginData?.totalCards, 12);
  assert.deepEqual(result?.nodePatch, { completed: false });
});
