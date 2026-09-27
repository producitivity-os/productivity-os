import type {
  WorkflowNodeButtonTheme,
  WorkflowNodeProgressTheme,
  WorkflowPluginPalette,
} from "@productivity-os/workflow-plugin-sdk";

export const healthNodeTheme = {
  surface: 0xffffff,
  accent: 0x0ea5e9,
  border: 0xcbd5e1,
  foreground: 0x172033,
  mutedForeground: 0x64748b,
  invertedForeground: 0xffffff,
  waterRadius: (height: number) => height / 2,
  typography: {
    fontFamily: "Inter Variable, Inter, sans-serif",
    titleSize: 15,
    titleWeight: "700",
    detailSize: 10,
    detailWeight: "500",
  },
  waterProgress: {
    track: 0xffffff,
    fill: 0x0ea5e9,
    invertedForeground: 0xffffff,
  } satisfies WorkflowNodeProgressTheme,
  completionProgress: {
    track: 0xffffff,
    fill: 0x0ea5e9,
    invertedForeground: 0xffffff,
  } satisfies WorkflowNodeProgressTheme,
  actionButton: {
    background: 0xf1f5f9,
    border: 0xcbd5e1,
    foreground: 0x172033,
    hoverBackground: 0xffffff,
    hoverBorder: 0x0ea5e9,
    hoverForeground: 0x172033,
    disabledBackground: 0xf1f5f9,
    disabledBorder: 0xcbd5e1,
    disabledForeground: 0x94a3b8,
    disabledAlpha: 0.62,
  } satisfies WorkflowNodeButtonTheme,
  foodButton: {
    background: 0xf1f5f9,
    border: 0xcbd5e1,
    foreground: 0x172033,
    hoverBackground: 0xffffff,
    hoverBorder: 0x0ea5e9,
    hoverForeground: 0x172033,
    completedBackground: 0xf1f5f9,
    completedBorder: 0xcbd5e1,
    completedForeground: 0x172033,
  } satisfies WorkflowNodeButtonTheme,
} as const;

export const healthPalette = {
  surface: "#ffffff",
  border: "#cbd5e1",
  foreground: "#172033",
  mutedForeground: "#64748b",
} as const satisfies WorkflowPluginPalette;
