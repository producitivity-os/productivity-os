import type {
  RevisionSession,
  RevisionSessionResult,
  RevisionSessionStatus,
} from "@productivity-os/workflow-plugin-sdk";

export const ALL_DUE_REVIEW_GOAL = {
  type: "cards",
  cardCount: 10_000,
} as const;

export type ReviseNodeData = Record<string, unknown> & {
  goal: typeof ALL_DUE_REVIEW_GOAL;
  notebookId: string | null;
  notebookTitle: string;
  sessionId: string | null;
  status: RevisionSessionStatus;
  elapsedMs: number;
  startedAt: number | null;
  totalCards: number;
  remainingCards: number;
  reviewedCount: number;
  rightCount: number;
  wrongCount: number;
  results: RevisionSessionResult[];
  sessionUpdatedAt: number;
};

export function reviewCardCounts(
  data: Pick<ReviseNodeData, "remainingCards" | "rightCount" | "wrongCount">,
) {
  const count = (value: number) =>
    Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  return {
    due: count(data.remainingCards),
    correct: count(data.rightCount),
    wrong: count(data.wrongCount),
  };
}

export function applyRevisionSession(
  data: ReviseNodeData,
  session: RevisionSession,
): ReviseNodeData {
  return {
    ...data,
    sessionId: session.id,
    goal: { ...ALL_DUE_REVIEW_GOAL },
    status: session.status,
    elapsedMs: session.elapsedMs,
    startedAt: session.startedAt,
    totalCards: session.totalCards,
    remainingCards: session.remainingCards,
    reviewedCount: session.reviewedCount,
    rightCount: session.rightCount,
    wrongCount: session.wrongCount,
    results: session.results,
    sessionUpdatedAt: session.updatedAt,
  };
}
