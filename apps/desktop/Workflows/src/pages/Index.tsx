import * as React from "react";
import { useNavigate } from "react-router-dom";
import {
  WorkspaceLibraryEmpty,
  WorkspaceLibraryHeading,
  WorkspaceLibraryMain,
  WorkspaceLibraryShell,
  WorkspaceLibrarySkeletonGrid,
  WorkspaceLibraryToolbar,
} from "@productivity-os/shared-ui/components/workspace-library";

import { AppSide } from "@/components/app-side";
import { CanvasPreviewCard } from "@/components/canvas-preview-card";
import { Settings } from "@/pages/Settings";
import { Media } from "@/pages/Media";
import type { CanvasRecord } from "@/data/canvases";
import type { CanvasDocumentSummary } from "@/api/canvas-data";
import {
  canvasLibraryFilterLabel,
  filterLibraryCanvases,
} from "@/features/library/canvas-library-filter";

type IndexProps = {
  canvases: CanvasDocumentSummary[];
  loading: boolean;
  starredIds: Set<string>;
  folders: string[];
  onCreateFolder(name: string): void;
  renamingCanvasId: string | null;
  onStarToggle(canvasId: string): void;
  onRenameCommit(canvasId: string, title: string): void;
  onRenameCancel(): void;
  onCreateCanvas(): void;
  page?: "library" | "media" | "settings";
};

export function Index({
  canvases: summaries,
  loading,
  starredIds,
  folders,
  onCreateFolder,
  renamingCanvasId,
  onStarToggle,
  onRenameCommit,
  onRenameCancel,
  onCreateCanvas,
  page = "library",
}: IndexProps) {
  const navigate = useNavigate();
  const [search, setSearch] = React.useState("");
  const [compact, setCompact] = React.useState(false);
  const [activeFilter, setActiveFilter] = React.useState("recents");
  const canvases = React.useMemo<CanvasRecord[]>(
    () =>
      summaries.map((canvas) => ({
        id: canvas.id,
        title: canvas.title,
        project: canvas.project,
        icon: canvas.icon,
        canvasType: canvas.canvasType,
        workflowKind: canvas.workflowKind,
        coverMediaId: canvas.coverMediaId,
        editedAt: canvas.updatedAt
          ? `Edited ${new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(Math.round((canvas.updatedAt - Date.now()) / 86_400_000), "day")}`
          : "Edited recently",
      })),
    [summaries],
  );
  const previews = React.useMemo(
    () =>
      Object.fromEntries(
        summaries.flatMap((canvas) =>
          canvas.previewDataUrl ? [[canvas.id, canvas.previewDataUrl]] : [],
        ),
      ),
    [summaries],
  );

  const visibleCanvases = React.useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const filtered = filterLibraryCanvases(canvases, activeFilter);
    if (!query) return filtered;
    return filtered.filter((canvas) =>
      `${canvas.title} ${canvas.project}`.toLocaleLowerCase().includes(query),
    );
  }, [activeFilter, search, canvases]);
  const filterLabel = canvasLibraryFilterLabel(activeFilter);

  const starredCanvases = canvases.filter((canvas) =>
    starredIds.has(canvas.id),
  );

  return (
    <WorkspaceLibraryShell>
      <AppSide
        loading={loading}
        search={search}
        onSearchChange={setSearch}
        starredCanvases={starredCanvases}
        folders={folders}
        onCreateFolder={onCreateFolder}
        onOpenCanvas={(canvasId) => navigate(`/workflow/${canvasId}`)}
        activeItem={
          page === "settings"
            ? "settings"
            : page === "media"
              ? "media"
              : activeFilter
        }
        onActiveItemChange={(id) => {
          setActiveFilter(id);
          if (page !== "library") navigate("/");
        }}
        onNavigateMedia={() => navigate("/media")}
        onNavigateSettings={() => navigate("/settings")}
      />

      <WorkspaceLibraryMain>
        {page === "settings" ? (
          <Settings />
        ) : page === "media" ? (
          <Media canvases={summaries} />
        ) : (
          <>
            <WorkspaceLibraryToolbar
              title={filterLabel}
              compact={compact}
              createLabel="New workflow"
              itemLabel="workflows"
              onCompactChange={setCompact}
              onCreate={onCreateCanvas}
            />

            <section className="workspace-library-content" aria-busy={loading}>
              <WorkspaceLibraryHeading
                title={search ? "Search results" : filterLabel}
                description={
                  search
                    ? `${visibleCanvases.length} matching workflows`
                    : activeFilter === "recents"
                      ? "Pick up where you left off"
                      : `${visibleCanvases.length} workflows`
                }
              />

              {loading ? (
                <WorkspaceLibrarySkeletonGrid />
              ) : visibleCanvases.length > 0 ? (
                <div
                  className={`workspace-library-card-grid${compact ? " compact" : ""}`}
                >
                  {visibleCanvases.map((canvas) => (
                    <CanvasPreviewCard
                      key={canvas.id}
                      canvas={canvas}
                      preview={previews[canvas.id]}
                      starred={starredIds.has(canvas.id)}
                      renaming={renamingCanvasId === canvas.id}
                      onOpen={(canvasId) => navigate(`/workflow/${canvasId}`)}
                      onStarToggle={onStarToggle}
                      onRenameCommit={onRenameCommit}
                      onRenameCancel={onRenameCancel}
                    />
                  ))}
                </div>
              ) : (
                <WorkspaceLibraryEmpty
                  noun="workflows"
                  searched={Boolean(search)}
                  onClearSearch={() => setSearch("")}
                />
              )}
            </section>
          </>
        )}
      </WorkspaceLibraryMain>
    </WorkspaceLibraryShell>
  );
}
