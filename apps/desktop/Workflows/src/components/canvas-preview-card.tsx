import { WorkspacePreviewCard } from "@productivity-os/shared-ui/components/workspace-library";

import type { CanvasRecord } from "@/data/canvases";
import { mediaUrl } from "@/api/media-data";

type CanvasPreviewCardProps = {
  canvas: CanvasRecord;
  preview?: string;
  starred: boolean;
  renaming: boolean;
  onOpen(canvasId: string): void;
  onStarToggle(canvasId: string): void;
  onRenameCommit(canvasId: string, title: string): void;
  onRenameCancel(): void;
};

export function CanvasPreviewCard({
  canvas,
  preview,
  starred,
  renaming,
  onOpen,
  onStarToggle,
  onRenameCommit,
  onRenameCancel,
}: CanvasPreviewCardProps) {
  return (
    <WorkspacePreviewCard
      data-canvas-id={canvas.id}
      item={{
        id: canvas.id,
        title: canvas.title,
        subtitle: `${canvas.workflowKind === "project" ? "Project" : "Workflow"} · ${canvas.editedAt}`,
        icon: canvas.icon,
        previewUrl: canvas.coverMediaId
          ? mediaUrl(canvas.coverMediaId, "thumbnail")
          : preview,
        draft: canvas.project === "Drafts",
      }}
      itemNoun="workflow"
      starred={starred}
      renaming={renaming}
      onOpen={() => onOpen(canvas.id)}
      onStarToggle={() => onStarToggle(canvas.id)}
      onRenameCommit={(title) => onRenameCommit(canvas.id, title)}
      onRenameCancel={onRenameCancel}
    />
  );
}
