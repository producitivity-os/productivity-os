import * as React from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@productivity-os/shared-ui/components/ui/tooltip";

type CanvasZoomBarProps = {
  zoom: number;
  onZoomChange(zoom: number): void;
};

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.1;

const percentFor = (zoom: number) => String(Math.round(zoom * 100));

export function CanvasZoomBar({ zoom, onZoomChange }: CanvasZoomBarProps) {
  const [draft, setDraft] = React.useState(percentFor(zoom));
  const [editing, setEditing] = React.useState(false);
  React.useEffect(() => {
    if (!editing) setDraft(percentFor(zoom));
  }, [editing, zoom]);

  const commit = () => {
    const parsed = Number.parseFloat(draft.replace("%", "").trim());
    if (!Number.isFinite(parsed)) {
      setDraft(percentFor(zoom));
      setEditing(false);
      return;
    }
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, parsed / 100));
    onZoomChange(next);
    setDraft(percentFor(next));
    setEditing(false);
  };

  return (
    <div className="canvas-zoom-bar" role="toolbar" aria-label="Workflow zoom">
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" aria-label="Zoom out" disabled={zoom <= MIN_ZOOM} onClick={() => onZoomChange(Math.max(MIN_ZOOM, zoom - ZOOM_STEP))}><ZoomOut /></button>
        </TooltipTrigger>
        <TooltipContent>Zoom out</TooltipContent>
      </Tooltip>
      <input
        aria-label="Zoom percentage"
        inputMode="decimal"
        value={draft}
        onFocus={(event) => { setEditing(true); event.currentTarget.select(); }}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            setDraft(percentFor(zoom));
            setEditing(false);
            event.currentTarget.select();
          }
        }}
      />
      <span aria-hidden="true">%</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" aria-label="Zoom in" disabled={zoom >= MAX_ZOOM} onClick={() => onZoomChange(Math.min(MAX_ZOOM, zoom + ZOOM_STEP))}><ZoomIn /></button>
        </TooltipTrigger>
        <TooltipContent>Zoom in</TooltipContent>
      </Tooltip>
    </div>
  );
}
