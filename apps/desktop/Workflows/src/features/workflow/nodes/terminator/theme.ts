import type { WorkflowNodeButtonTheme } from "@productivity-os/workflow-plugin-sdk";
import { workflowNodeTheme } from "../theme.ts";

export const terminatorNodeTheme = {
  surface: workflowNodeTheme.surface,
  border: workflowNodeTheme.border,
  foreground: workflowNodeTheme.ink,
  resetButton: {
    background: workflowNodeTheme.white,
    border: 0xcbd5e1,
    foreground: workflowNodeTheme.ink,
    hoverBackground: workflowNodeTheme.subtleSurface,
    hoverBorder: workflowNodeTheme.blue,
    hoverForeground: workflowNodeTheme.ink,
  } satisfies WorkflowNodeButtonTheme,
} as const;
