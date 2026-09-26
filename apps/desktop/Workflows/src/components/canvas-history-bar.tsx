import { Redo2, Undo2 } from "lucide-react";
import type { CanvasHistoryState } from "@productivity-os/canvas";
import { Kbd } from "@productivity-os/shared-ui/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@productivity-os/shared-ui/components/ui/tooltip";

type CanvasHistoryBarProps = CanvasHistoryState & {
  onUndo(): void;
  onRedo(): void;
};

export function CanvasHistoryBar({ canUndo, canRedo, onUndo, onRedo }: CanvasHistoryBarProps) {
  return (
    <div className="canvas-history-bar" role="toolbar" aria-label="Workflow history">
      <Tooltip>
        <TooltipTrigger asChild><button type="button" aria-label="Undo" disabled={!canUndo} onClick={onUndo}><Undo2 /></button></TooltipTrigger>
        <TooltipContent>Undo <Kbd>⌘/Ctrl Z</Kbd></TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild><button type="button" aria-label="Redo" disabled={!canRedo} onClick={onRedo}><Redo2 /></button></TooltipTrigger>
        <TooltipContent>Redo <Kbd>⌘/Ctrl U</Kbd></TooltipContent>
      </Tooltip>
    </div>
  );
}
