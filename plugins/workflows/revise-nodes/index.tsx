import * as React from "react";
import { BrainCircuit } from "lucide-react";
import { Graphics, Text } from "pixi.js";
import {
  WorkflowNodeButton,
  WorkflowNodeProgressBar,
  type RevisionSessionResult,
  type RevisionSessionStatus,
  type WorkflowNodePickerPreviewProps,
  type WorkflowNodePluginPackage,
  type WorkflowPluginActionResult,
  type WorkflowPluginNode,
  type WorkflowPluginPropertiesProps,
} from "@productivity-os/workflow-plugin-sdk";
import { reviseNodeTheme, revisePalette } from "./theme";
import { pressReviewSession } from "./actions";
import {
  ALL_DUE_REVIEW_GOAL,
  reviewCardCounts,
  type ReviseNodeData,
} from "./model";

export type { ReviseNodeData } from "./model";

const createData = (): ReviseNodeData => ({
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

function migrateData(data: Record<string, unknown>): ReviseNodeData {
  return {
    ...createData(),
    ...data,
    goal: { ...ALL_DUE_REVIEW_GOAL },
    results: Array.isArray(data.results)
      ? (data.results as RevisionSessionResult[])
      : [],
  } as ReviseNodeData;
}

function reviewProgress(data: ReviseNodeData): number {
  if (data.status === "completed") return 1;
  return data.reviewedCount / Math.max(1, data.totalCards);
}

function ReviewPreview({ palette }: WorkflowNodePickerPreviewProps) {
  return (
    <span
      className="workflow-plugin-node-preview"
      style={
        {
          "--workflow-plugin-surface": palette.surface,
          "--workflow-plugin-border": palette.border,
          "--workflow-plugin-foreground": palette.foreground,
          "--workflow-plugin-muted": palette.mutedForeground,
          "--workflow-plugin-count-due": reviseNodeTheme.counters.dueCss,
          "--workflow-plugin-count-correct":
            reviseNodeTheme.counters.correctCss,
          "--workflow-plugin-count-wrong": reviseNodeTheme.counters.wrongCss,
        } as React.CSSProperties
      }
    >
      <span className="workflow-plugin-preview-icon" aria-hidden="true">
        ▶
      </span>
      <span className="workflow-plugin-preview-copy">
        <strong>Review</strong>
      </span>
      <span
        className="workflow-plugin-preview-counters"
        aria-label="0 due, 0 correct, 0 wrong"
      >
        <strong>0</strong>
        <strong>0</strong>
        <strong>0</strong>
      </span>
    </span>
  );
}

function ReviseProperties({
  node,
  services,
  updateNode,
}: WorkflowPluginPropertiesProps<ReviseNodeData>) {
  const data = migrateData(node.pluginData);
  const locked = data.status === "running" || data.status === "paused";
  const [notebooks, setNotebooks] = React.useState<
    Array<{ id: string; title: string }>
  >([]);
  React.useEffect(() => {
    let current = true;
    void services.listRevisionNotebooks().then((items) => {
      if (current) setNotebooks(items);
    });
    return () => {
      current = false;
    };
  }, [services]);
  const update = (patch: Partial<ReviseNodeData>) =>
    updateNode({ pluginData: { ...data, ...patch } });
  return (
    <>
      <label className="canvas-property-control">
        <span>Cards</span>
        <select
          disabled={locked}
          value={data.notebookId ?? ""}
          onChange={(event) => {
            const notebookId = event.currentTarget.value || null;
            const notebookTitle =
              notebooks.find((item) => item.id === notebookId)?.title ??
              "All notebooks";
            update({ notebookId, notebookTitle });
          }}
        >
          <option value="">All due cards</option>
          {notebooks.map((notebook) => (
            <option key={notebook.id} value={notebook.id}>
              {notebook.title}
            </option>
          ))}
        </select>
      </label>
      <div className="workflow-plugin-summary">
        <span>Goal</span>
        <span>Complete all due cards</span>
      </div>
      <div className="workflow-plugin-summary">
        <span>{statusLabel(data.status)}</span>
        <span>{data.remainingCards} due</span>
      </div>
      <div className="workflow-plugin-summary">
        <span>✓ {data.rightCount} right</span>
        <span>✕ {data.wrongCount} wrong</span>
      </div>
      {data.results.length > 0 && (
        <div className="workflow-review-results">
          {data.results.map((result) => (
            <article
              key={`${result.sequence}:${result.cardId}`}
              data-correct={result.correct}
            >
              <header>
                <strong>{result.correct ? "Right" : "Wrong"}</strong>
                <span>{result.answer}</span>
              </header>
              <p>{result.question || "Untitled question"}</p>
              <small>{result.expectedAnswer || "No answer provided"}</small>
            </article>
          ))}
        </div>
      )}
      {data.reviewedCount > 0 && data.results.length === 0 && (
        <small className="workflow-plugin-field-error">
          Detailed answers are unavailable for this legacy session.
        </small>
      )}
    </>
  );
}

function label(
  text: string,
  x: number,
  y: number,
  size: number,
  color: number,
  weight: "normal" | "bold" = "normal",
) {
  const value = new Text({
    text,
    style: {
      fill: color,
      fontFamily: reviseNodeTheme.typography.fontFamily,
      fontSize: size,
      fontWeight: weight,
    },
  });
  value.position.set(x, y);
  return value;
}

const reviewProgressBar = new WorkflowNodeProgressBar<
  WorkflowPluginNode<ReviseNodeData>
>({
  id: "revise:progress",
  bounds: (node) => ({ x: 0, y: 0, width: node.width, height: node.height }),
  value: (node) => reviewProgress(migrateData(node.pluginData)),
  theme: reviseNodeTheme.progress,
  radius: 20,
  animationDurationMs: 300,
});

const reviewButton = new WorkflowNodeButton<
  WorkflowPluginNode<ReviseNodeData>,
  WorkflowPluginPropertiesProps<ReviseNodeData>["services"],
  WorkflowPluginActionResult<ReviseNodeData>
>({
  id: "revise:toggle",
  bounds: (node) => ({ x: 12, y: node.height / 2 - 18, width: 36, height: 36 }),
  icon: (node) => {
    const data = migrateData(node.pluginData);
    if (data.status === "running") return "pause";
    if (data.status === "completed") return "check";
    return "play";
  },
  theme: (node) =>
    migrateData(node.pluginData).status === "running"
      ? reviseNodeTheme.runningButton
      : reviseNodeTheme.button,
  completed: (node) => migrateData(node.pluginData).status === "completed",
  disabled: (node) => migrateData(node.pluginData).status === "completed",
  async onPress({ node, workflowId, services }) {
    const data = migrateData(node.pluginData);
    return pressReviewSession(node, data, workflowId, services);
  },
});

function renderReviewContents(
  target: import("pixi.js").Container,
  node: WorkflowPluginNode<ReviseNodeData>,
  inverted: boolean,
): void {
  const data = migrateData(node.pluginData);
  const counts = reviewCardCounts(data);
  const title = label(
    "Review",
    58,
    node.height / 2,
    reviseNodeTheme.typography.titleSize,
    inverted ? reviseNodeTheme.surface : reviseNodeTheme.foreground,
    reviseNodeTheme.typography.titleWeight,
  );
  title.anchor.set(0, 0.5);
  target.addChild(title);
  const counterValues = [
    [counts.due, reviseNodeTheme.counters.due],
    [counts.correct, reviseNodeTheme.counters.correct],
    [counts.wrong, reviseNodeTheme.counters.wrong],
  ] as const;
  for (const [index, [value, color]] of counterValues.entries()) {
    const counter = label(
      String(value),
      node.width -
        reviseNodeTheme.counters.rightInset -
        reviseNodeTheme.counters.columnWidth * (2 - index),
      node.height / 2,
      reviseNodeTheme.counters.size,
      color,
      reviseNodeTheme.counters.weight,
    );
    counter.anchor.set(1, 0.5);
    target.addChild(counter);
  }
}

const plugin: WorkflowNodePluginPackage = {
  manifest: {
    id: "workflows.revise-nodes",
    name: "Revise Nodes",
    version: "2.0.0",
    description: "Complete due flashcards from a workflow.",
    marketplace: true,
    defaultInstalled: true,
    app: {
      id: "revise",
      name: "Revise",
      icon: BrainCircuit,
      launchTarget: "revise",
      palette: revisePalette,
    },
  },
  nodes: [
    {
      nodeType: "timed-revision",
      title: "Review",
      description: "Complete every card currently due",
      icon: BrainCircuit,
      schemaVersion: 3,
      defaultSize: { width: 300, height: 72 },
      NodePickerPreview: ReviewPreview,
      createData,
      migrate: migrateData,
      PropertiesEditor: ReviseProperties,
      buttons: [reviewButton],
      progressBars: [reviewProgressBar],
      render(target, rawNode, context) {
        const node = rawNode as WorkflowPluginNode<ReviseNodeData>;
        reviewProgressBar.renderContent(
          target,
          node,
          context,
          (content, contentNode, _renderContext, inverted) =>
            renderReviewContents(content, contentNode, inverted),
        );
        target.addChild(
          new Graphics()
            .roundRect(0, 0, node.width, node.height, 20)
            .stroke({ color: reviseNodeTheme.border, width: 1.5 }),
        );
      },
      reset: (rawData) => {
        const data = migrateData(rawData);
        return {
          ...createData(),
          notebookId: data.notebookId,
          notebookTitle: data.notebookTitle,
        };
      },
    },
  ],
};

function statusLabel(status: RevisionSessionStatus): string {
  if (status === "idle") return "Not started";
  return status[0].toUpperCase() + status.slice(1);
}

export default plugin;
