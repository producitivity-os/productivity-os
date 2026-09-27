import type {
  WorkflowPluginActionResult,
  WorkflowPluginNode,
  WorkflowPluginServices,
} from "@productivity-os/workflow-plugin-sdk";
import {
  ALL_DUE_REVIEW_GOAL,
  applyRevisionSession,
  type ReviseNodeData,
} from "./model.ts";

export async function pressReviewSession(
  node: WorkflowPluginNode<ReviseNodeData>,
  data: ReviseNodeData,
  workflowId: string,
  services: WorkflowPluginServices,
): Promise<WorkflowPluginActionResult<ReviseNodeData> | undefined> {
  if (data.status === "running" && data.sessionId) {
    const session = await services.setRevisionSessionStatus(
      data.sessionId,
      "paused",
    );
    return { pluginData: applyRevisionSession(data, session) };
  }
  if (data.status === "paused" && data.sessionId) {
    const session = await services.launchRevisionSession({
      workflowId,
      nodeId: node.id,
      sessionId: data.sessionId,
      notebookId: data.notebookId,
      goal: { ...ALL_DUE_REVIEW_GOAL },
    });
    return { pluginData: applyRevisionSession(data, session) };
  }
  if (data.status === "completed") return undefined;
  const session = await services.launchRevisionSession({
    workflowId,
    nodeId: node.id,
    sessionId: crypto.randomUUID(),
    notebookId: data.notebookId,
    goal: { ...ALL_DUE_REVIEW_GOAL },
  });
  return {
    pluginData: applyRevisionSession(
      {
        ...data,
        results: [],
        rightCount: 0,
        wrongCount: 0,
        reviewedCount: 0,
      },
      session,
    ),
    nodePatch: { completed: false },
  };
}
