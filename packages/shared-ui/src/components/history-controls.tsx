import * as React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { Button } from "./ui/button";
import { ButtonGroup, ButtonGroupSeparator } from "./ui/button-group";

export type HistoryControls = HTMLDivElement & {
  setState: (canUndo: boolean, canRedo: boolean) => void;
};

export type HistoryControlOptions = {
  onUndo: () => void;
  onRedo: () => void;
  undoIcon: Node | string;
  redoIcon: Node | string;
  className?: string;
};

function iconMarkup(icon: Node | string) {
  if (typeof icon === "string") return icon;
  return icon instanceof Element ? icon.outerHTML : "";
}

function HistoryControlsView({
  options,
  state,
}: {
  options: HistoryControlOptions;
  state: { canUndo: boolean; canRedo: boolean };
}) {
  return (
    <ButtonGroup className="h-full">
      <Button type="button" variant="ghost" size="icon" title="Undo" aria-label="Undo" disabled={!state.canUndo} onClick={options.onUndo}>
        <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: iconMarkup(options.undoIcon) }} />
      </Button>
      <ButtonGroupSeparator />
      <Button type="button" variant="ghost" size="icon" title="Redo" aria-label="Redo" disabled={!state.canRedo} onClick={options.onRedo}>
        <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: iconMarkup(options.redoIcon) }} />
      </Button>
    </ButtonGroup>
  );
}

/** Themeable undo/redo control shared by canvas-style editors. */
export function createHistoryControls(options: HistoryControlOptions): HistoryControls {
  const root = document.createElement("div") as HistoryControls;
  root.className = options.className ?? "ps-history-controls";
  let state = { canUndo: false, canRedo: false };
  const reactRoot = createRoot(root);
  // Consumers attach imperative handlers immediately after creating the control.
  // Commit synchronously so those buttons are available before the factory returns.
  const render = () => flushSync(() => reactRoot.render(<HistoryControlsView options={options} state={state} />));
  root.setState = (canUndo, canRedo) => {
    state = { canUndo, canRedo };
    render();
  };
  render();
  return root;
}

export { HistoryControlsView as HistoryControlsComponent };
