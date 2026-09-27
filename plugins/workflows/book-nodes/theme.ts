import type {
  WorkflowNodeButtonTheme,
  WorkflowNodeProgressTheme,
  WorkflowPluginPalette,
} from "@productivity-os/workflow-plugin-sdk";

export const bookNodeTheme = {
  surface: 0xffffff,
  accent: 0x8b2f2f,
  border: 0xcbd5e1,
  foreground: 0x172033,
  mutedForeground: 0x64748b,
  completedForeground: 0x172033,
  coverPlaceholder: 0xf4e8e8,
  clipMask: 0xffffff,
  typography: {
    fontFamily: "Inter Variable, Inter, sans-serif",
    titleSize: 14,
    titleWeight: "600",
    strongTitleWeight: "700",
    detailSize: 10,
    detailWeight: "500",
    footnoteSize: 9,
    timerSize: 12,
    timerWeight: "700",
  },
  progress: {
    track: 0xffffff,
    fill: 0x8b2f2f,
    invertedForeground: 0xffffff,
  } satisfies WorkflowNodeProgressTheme,
  timerButton: {
    background: 0xf1f5f9,
    border: 0xcbd5e1,
    foreground: 0x172033,
    hoverBackground: 0xffffff,
    hoverBorder: 0x8b2f2f,
    hoverForeground: 0x172033,
  } satisfies WorkflowNodeButtonTheme,
  runningTimerButton: {
    background: 0x8b2f2f,
    border: 0x8b2f2f,
    foreground: 0xffffff,
    hoverBackground: 0x742626,
    hoverBorder: 0x742626,
    hoverForeground: 0xffffff,
  } satisfies WorkflowNodeButtonTheme,
} as const;

export const bookPalette = {
  surface: "#ffffff",
  border: "#cbd5e1",
  foreground: "#172033",
  mutedForeground: "#64748b",
} as const satisfies WorkflowPluginPalette;
