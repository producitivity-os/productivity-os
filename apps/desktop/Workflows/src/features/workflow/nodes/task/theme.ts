import type { WorkflowNodeButtonTheme } from "@productivity-os/workflow-plugin-sdk";
import { workflowNodeTheme } from "../theme.ts";

export const taskNodeTheme = {
  surface: workflowNodeTheme.white,
  border: workflowNodeTheme.border,
  foreground: workflowNodeTheme.ink,
  muted: workflowNodeTheme.muted,
  accent: workflowNodeTheme.blue,
  divider: workflowNodeTheme.divider,
  completedSurface: workflowNodeTheme.completedSurface,
  completedBorder: workflowNodeTheme.completedBorder,
  completedText: workflowNodeTheme.completedText,
  addButton: {
    background: workflowNodeTheme.subtleSurface,
    border: workflowNodeTheme.border,
    foreground: workflowNodeTheme.blue,
    hoverBackground: workflowNodeTheme.white,
    hoverBorder: workflowNodeTheme.blue,
    hoverForeground: workflowNodeTheme.blue,
  } satisfies WorkflowNodeButtonTheme,
} as const;
