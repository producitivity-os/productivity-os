import type {
  WorkflowNodeButtonTheme,
  WorkflowNodeProgressTheme,
} from "@productivity-os/workflow-plugin-sdk";
import { workflowNodeTheme } from "../theme.ts";

export const timerNodeTheme = {
  surface: workflowNodeTheme.white,
  border: workflowNodeTheme.border,
  foreground: workflowNodeTheme.ink,
  muted: workflowNodeTheme.muted,
  accent: workflowNodeTheme.blue,
  progress: {
    track: workflowNodeTheme.white,
    fill: workflowNodeTheme.blue,
    invertedForeground: workflowNodeTheme.white,
  } satisfies WorkflowNodeProgressTheme,
  button: {
    background: 0xf1f5f9,
    border: workflowNodeTheme.border,
    foreground: workflowNodeTheme.ink,
    hoverBackground: workflowNodeTheme.white,
    hoverBorder: workflowNodeTheme.blue,
    hoverForeground: workflowNodeTheme.ink,
  } satisfies WorkflowNodeButtonTheme,
  runningButton: {
    background: workflowNodeTheme.blue,
    border: workflowNodeTheme.blue,
    foreground: workflowNodeTheme.white,
    hoverBackground: 0x2563eb,
    hoverBorder: 0x2563eb,
    hoverForeground: workflowNodeTheme.white,
  } satisfies WorkflowNodeButtonTheme,
} as const;
