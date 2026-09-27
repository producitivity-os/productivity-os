import { ExternalLink, File } from "lucide-react";

import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import type { WorkspaceMediaItem } from "./workspace-media-library";

type WorkspaceMediaPreviewDialogProps = {
  item: WorkspaceMediaItem | null;
  onOpenChange(open: boolean): void;
  onOpenExternally(item: WorkspaceMediaItem): void;
};

function WorkspaceMediaPreviewDialog({
  item,
  onOpenChange,
  onOpenExternally,
}: WorkspaceMediaPreviewDialogProps) {
  return (
    <Dialog open={Boolean(item)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-3rem)] max-w-4xl overflow-hidden">
        {item && (
          <>
            <DialogHeader>
              <DialogTitle>{item.name}</DialogTitle>
              <DialogDescription>
                {item.mimeType} · {item.ownerTitle}
              </DialogDescription>
            </DialogHeader>
            <div className="grid min-h-56 place-items-center overflow-auto rounded-lg bg-muted/45 p-3">
              {item.kind === "image" && item.contentUrl && (
                <img
                  className="max-h-[65vh] max-w-full object-contain"
                  src={item.contentUrl}
                  alt={item.name}
                />
              )}
              {item.kind === "video" && item.contentUrl && (
                <video
                  className="max-h-[65vh] max-w-full"
                  src={item.contentUrl}
                  controls
                />
              )}
              {item.kind === "audio" && item.contentUrl && (
                <audio
                  className="w-full max-w-xl"
                  src={item.contentUrl}
                  controls
                />
              )}
              {item.kind === "pdf" && item.contentUrl && (
                <iframe
                  className="h-[65vh] w-full rounded-md bg-white"
                  src={item.contentUrl}
                  title={item.name}
                />
              )}
              {(item.kind === "document" ||
                item.kind === "file" ||
                !item.contentUrl) && (
                <span className="grid justify-items-center gap-3 text-center text-muted-foreground">
                  <File className="size-9" />
                  <strong className="text-sm text-foreground">
                    No in-app preview is available for this file.
                  </strong>
                </span>
              )}
            </div>
            <DialogFooter>
              <Button type="button" onClick={() => onOpenExternally(item)}>
                <ExternalLink /> Open in default app
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export { WorkspaceMediaPreviewDialog };
export type { WorkspaceMediaPreviewDialogProps };
