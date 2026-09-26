import * as React from "react";
import { SidebarTrigger } from "@productivity-os/shared-ui/components/ui/sidebar";
import {
  WorkspaceMediaLibrary,
  type WorkspaceMediaItem,
  type WorkspaceMediaKind,
} from "@productivity-os/shared-ui/components/workspace-media-library";
import { WorkspaceMediaPreviewDialog } from "@productivity-os/shared-ui/components/workspace-media-preview-dialog";
import { toast } from "@productivity-os/shared-ui/hooks/use-toast";

import {
  mediaData,
  mediaUrl,
  type MediaCursor,
  type MediaEntry,
  type MediaKind,
} from "@/api/media-data";
import type { CanvasDocumentSummary } from "@/api/canvas-data";

function asWorkspaceItem(entry: MediaEntry): WorkspaceMediaItem {
  return {
    id: entry.id,
    ownerId: entry.canvasId,
    ownerTitle: entry.canvasTitle,
    name: entry.originalName,
    mimeType: entry.mimeType,
    kind: entry.kind,
    sizeBytes: entry.sizeBytes,
    previewUrl: entry.hasThumbnail
      ? mediaUrl(entry.id, "thumbnail")
      : entry.kind === "image"
        ? mediaUrl(entry.id)
        : null,
    contentUrl: mediaUrl(entry.id),
  };
}

export function Media({ canvases }: { canvases: CanvasDocumentSummary[] }) {
  const [search, setSearch] = React.useState("");
  const [canvasFilter, setCanvasFilter] = React.useState("all");
  const [kindFilter, setKindFilter] = React.useState<
    "all" | WorkspaceMediaKind
  >("all");
  const [uploadCanvasId, setUploadCanvasId] = React.useState(
    canvases[0]?.id ?? "",
  );
  const [items, setItems] = React.useState<MediaEntry[]>([]);
  const [nextCursor, setNextCursor] = React.useState<MediaCursor | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [uploading, setUploading] = React.useState(false);
  const [previewItem, setPreviewItem] =
    React.useState<WorkspaceMediaItem | null>(null);

  React.useEffect(() => {
    if (!uploadCanvasId && canvases[0]) setUploadCanvasId(canvases[0].id);
  }, [uploadCanvasId, canvases]);

  const load = React.useCallback(
    async (cursor: MediaCursor | null = null) => {
      setLoading(true);
      try {
        const page = await mediaData.list({
          canvasId: canvasFilter === "all" ? null : canvasFilter,
          canvasType: "workflow",
          kind: kindFilter === "all" ? null : (kindFilter as MediaKind),
          query: search || null,
          cursor,
          limit: 60,
        });
        setItems((current) =>
          cursor ? [...current, ...page.items] : page.items,
        );
        setNextCursor(page.nextCursor);
      } catch (error) {
        toast({
          title: "Couldn’t load media",
          description: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setLoading(false);
      }
    },
    [canvasFilter, kindFilter, search],
  );

  React.useEffect(() => {
    const timer = window.setTimeout(() => void load(), 180);
    return () => window.clearTimeout(timer);
  }, [load]);

  const importFiles = async () => {
    const canvas = canvases.find(
      (candidate) => candidate.id === uploadCanvasId,
    );
    if (!canvas) return;
    setUploading(true);
    try {
      const result = await mediaData.chooseAndImport(canvas.id, canvas.title);
      if (result.imported.length) {
        toast({
          title: `${result.imported.length} file${result.imported.length === 1 ? "" : "s"} added`,
          description: `Associated with ${canvas.title}.`,
        });
        await load();
      } else if (result.duplicates.length) {
        toast({
          title: "Already in this workflow",
          description: `${result.duplicates.length} duplicate file${result.duplicates.length === 1 ? " was" : "s were"} skipped.`,
        });
      }
      if (result.failures[0])
        toast({
          title: "Some files couldn’t be added",
          description: result.failures[0].message,
        });
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setUploading(false);
    }
  };

  const workspaceItems = items.map(asWorkspaceItem);
  return (
    <>
      <WorkspaceMediaLibrary
        items={workspaceItems}
        owners={canvases.map((canvas) => ({
          id: canvas.id,
          title: canvas.title,
        }))}
        ownerNoun="workflow"
        description="Files stored by your workflows"
        search={search}
        ownerFilter={canvasFilter}
        kindFilter={kindFilter}
        importOwnerId={uploadCanvasId}
        loading={loading}
        importing={uploading}
        hasMore={Boolean(nextCursor)}
        leading={<SidebarTrigger className="canvas-mobile-sidebar-trigger" />}
        onSearchChange={setSearch}
        onOwnerFilterChange={setCanvasFilter}
        onKindFilterChange={setKindFilter}
        onImportOwnerChange={setUploadCanvasId}
        onImport={importFiles}
        onLoadMore={() => load(nextCursor)}
        onPreview={setPreviewItem}
        onOpen={(item) => mediaData.open(item.id)}
        onReveal={(item) => mediaData.reveal(item.id)}
        onDelete={async (item) => {
          await mediaData.delete(item.id);
          setItems((current) =>
            current.filter((entry) => entry.id !== item.id),
          );
          setPreviewItem((current) =>
            current?.id === item.id ? null : current,
          );
        }}
      />
      <WorkspaceMediaPreviewDialog
        item={previewItem}
        onOpenChange={(open) => {
          if (!open) setPreviewItem(null);
        }}
        onOpenExternally={(item) => void mediaData.open(item.id)}
      />
    </>
  );
}
