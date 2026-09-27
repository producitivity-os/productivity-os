import type {
  WorkflowNodeButtonTheme,
  WorkflowNodeProgressTheme,
  WorkflowNodeWaveformTheme,
  WorkflowPluginPalette,
} from "@productivity-os/workflow-plugin-sdk";

export const quranNodeTheme = {
  surface: 0xffffff,
  accent: 0x7c3aed,
  border: 0xcbd5e1,
  foreground: 0x172033,
  mutedForeground: 0x64748b,
  progress: {
    track: 0xffffff,
    fill: 0x7c3aed,
    invertedForeground: 0xffffff,
  } satisfies WorkflowNodeProgressTheme,
  waveform: {
    background: 0xf1f5f9,
    border: 0xcbd5e1,
    borderAlpha: 0.75,
    wave: 0x94a3b8,
    waveAlpha: 0.82,
    playedWave: 0x7c3aed,
    playedWaveAlpha: 1,
    playhead: 0x5b21b6,
    emptyWave: 0xc4b5fd,
    emptyWaveAlpha: 0.55,
    disabledAlpha: 0.45,
  } satisfies WorkflowNodeWaveformTheme,
  recordButton: {
    background: 0xf1f5f9,
    border: 0xcbd5e1,
    foreground: 0x7c3aed,
    hoverBackground: 0xffffff,
    hoverBorder: 0x7c3aed,
    hoverForeground: 0x6d28d9,
    disabledBackground: 0xf1f5f9,
    disabledBorder: 0xcbd5e1,
    disabledForeground: 0x94a3b8,
  } satisfies WorkflowNodeButtonTheme,
  typography: {
    fontFamily: "Inter Variable, Inter, sans-serif",
    titleSize: 13,
    titleWeight: "600",
  },
} as const;

export const quranPalette = {
  surface: "#ffffff",
  border: "#cbd5e1",
  foreground: "#172033",
  mutedForeground: "#64748b",
} as const satisfies WorkflowPluginPalette;
