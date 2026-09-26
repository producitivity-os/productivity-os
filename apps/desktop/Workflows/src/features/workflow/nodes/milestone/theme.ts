import { workflowNodeTheme } from "../theme.ts";

export const milestoneNodeTheme = {
  surface: workflowNodeTheme.surface,
  border: workflowNodeTheme.border,
  foreground: workflowNodeTheme.ink,
  muted: workflowNodeTheme.muted,
} as const;
