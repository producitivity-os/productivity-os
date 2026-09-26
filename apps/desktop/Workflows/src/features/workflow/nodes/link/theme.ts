import { workflowNodeTheme } from "../theme.ts";

export const linkNodeTheme = {
  surface: workflowNodeTheme.surface,
  border: workflowNodeTheme.border,
  foreground: workflowNodeTheme.ink,
  accent: workflowNodeTheme.blue,
} as const;
