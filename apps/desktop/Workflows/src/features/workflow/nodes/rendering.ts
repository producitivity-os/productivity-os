import { Graphics, Text, type Container } from "pixi.js";
import type { WorkflowNode, WorkflowTerminatorNode } from "./index.ts";
import { workflowNodeTheme } from "./theme.ts";

type TextAlign = "left" | "center" | "right";

export function nodeLabel(
  value: string,
  x: number,
  y: number,
  size: number,
  color: number,
  align: TextAlign,
): Text {
  const text = new Text({
    text: value,
    style: {
      fill: color,
      fontFamily: workflowNodeTheme.fontFamily,
      fontSize: size,
      fontWeight: "600",
    },
  });
  text.anchor.set(align === "center" ? 0.5 : align === "right" ? 1 : 0, 0.5);
  text.position.set(x, y);
  return text;
}

export function wrappedNodeLabel(
  value: string,
  x: number,
  y: number,
  width: number,
  maxLines: number,
  size: number,
  color: number,
  align: TextAlign,
): Text {
  const lineHeight = Math.ceil(size * 1.22);
  const charactersPerLine = Math.max(2, Math.floor(width / (size * 0.58)));
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  let truncated = false;
  for (const word of words) {
    const parts =
      word.length > charactersPerLine
        ? (word.match(new RegExp(`.{1,${charactersPerLine}}`, "g")) ?? [word])
        : [word];
    for (const part of parts) {
      const candidate = current ? `${current} ${part}` : part;
      if (candidate.length <= charactersPerLine) {
        current = candidate;
        continue;
      }
      lines.push(current);
      current = part;
      if (lines.length >= maxLines) {
        truncated = true;
        break;
      }
    }
    if (truncated) break;
  }
  if (!truncated && current) lines.push(current);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    truncated = true;
  }
  if (truncated && lines.length) {
    const last = lines.length - 1;
    lines[last] =
      `${lines[last].slice(0, Math.max(1, charactersPerLine - 1)).trimEnd()}…`;
  }
  const text = new Text({
    text: lines.join("\n") || value,
    style: {
      fill: color,
      fontFamily: workflowNodeTheme.fontFamily,
      fontSize: size,
      fontWeight: "600",
      lineHeight,
    },
  });
  text.anchor.set(align === "center" ? 0.5 : align === "right" ? 1 : 0, 0.5);
  text.position.set(x, y);
  return text;
}

export function renderWorkflowHoverOutline(
  root: Container,
  node: WorkflowNode,
  radius = 20,
): void {
  const outline = new Graphics();
  if (node.nodeKind === "terminator") {
    if ((node as WorkflowTerminatorNode).role === "End")
      outline.roundRect(2, 2, node.width - 4, node.height - 4, 28);
    else outline.circle(node.width / 2, node.height / 2, node.width / 2 - 2);
  } else if (node.nodeKind === "milestone") {
    outline
      .moveTo(node.width / 2, 0)
      .lineTo(node.width, node.height / 2)
      .lineTo(node.width / 2, node.height)
      .lineTo(0, node.height / 2)
      .closePath();
  } else outline.roundRect(0, 0, node.width, node.height, radius);
  outline.stroke({
    color: workflowNodeTheme.blue,
    width: 1.5,
    alpha: 0.95,
    join: "round",
  });
  root.addChild(outline);
}

export function renderWorkflowRunningPulse(
  root: Container,
  node: WorkflowNode,
): void {
  const wave = (Math.sin(Date.now() / 260) + 1) / 2;
  root.addChild(
    new Graphics()
      .roundRect(-2, -2, node.width + 4, node.height + 4, 22)
      .stroke({
        color: workflowNodeTheme.blue,
        width: 2 + wave,
        alpha: 0.34 + wave * 0.42,
        join: "round",
      }),
  );
}
