import * as React from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

import { Detail } from "@/pages/Detail";
import type { CanvasDocumentSummary } from "@/api/canvas-data";
import type { CanvasSidebarView } from "@/components/canvas-sidebar";
import { CanvasTabCache } from "@/components/canvas-tab-cache";

type CanvasTabHostProps = {
  canvasId: string;
  view: CanvasSidebarView;
  canvases: readonly CanvasDocumentSummary[];
  starredIds: Set<string>;
  onDelete(canvasId: string): void;
  onTitleChange(canvasId: string, title: string): void;
  onPreviewChange(canvasId: string, previewDataUrl: string): void;
  onNavigate(path: string): void;
  onRegisterCanvasExit(handler: (() => Promise<void>) | null): void;
};

export function CanvasTabHost(props: CanvasTabHostProps) {
  const { canvasId, view, onNavigate } = props;
  const cacheRef = React.useRef<CanvasTabCache | null>(null);
  if (!cacheRef.current) {
    cacheRef.current = new CanvasTabCache(2);
    cacheRef.current.select(canvasId);
  }
  const cache = cacheRef.current;
  const [, setCacheVersion] = React.useState(0);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const desiredCanvasIdRef = React.useRef(canvasId);

  React.useEffect(() => {
    desiredCanvasIdRef.current = canvasId;
    setLoadError(null);
    cache.select(canvasId);
    setCacheVersion((version) => version + 1);
  }, [cache, canvasId]);

  const surfaces = cache.entries();
  const loading = cache.isLoading();

  const markReady = React.useCallback(
    (readyCanvasId: string, surfaceKey?: string) => {
      const entry = surfaceKey
        ? cache.entries().find((candidate) => candidate.key === surfaceKey)
        : cache.entries().find((candidate) => candidate.canvasId === readyCanvasId);
      if (!entry || entry.canvasId !== readyCanvasId) return;
      if (cache.markReady(entry.key)) setLoadError(null);
      setCacheVersion((version) => version + 1);
    },
    [cache],
  );

  const handleLoadError = React.useCallback(
    (failedCanvasId: string, error: unknown, surfaceKey?: string) => {
      if (desiredCanvasIdRef.current !== failedCanvasId) return;
      if (
        surfaceKey &&
        !cache
          .entries()
          .some(
            (entry) =>
              entry.key === surfaceKey && entry.canvasId === failedCanvasId,
          )
      )
        return;
      setLoadError(error instanceof Error ? error.message : String(error));
    },
    [cache],
  );

  const retry = () => {
    setLoadError(null);
    cache.retry(canvasId);
    setCacheVersion((version) => version + 1);
  };

  const displayedSurface = cache.displayed();

  return (
    <div className="canvas-tab-host" aria-busy={loading}>
      {surfaces.map((entry) => {
        const visible = entry.key === displayedSurface?.key;
        return (
          <div
            key={entry.key}
            className={`canvas-tab-surface${visible ? " is-visible" : ""}`}
            aria-hidden={!visible}
          >
            <Detail
              {...props}
              canvasId={entry.canvasId}
              surfaceKey={entry.key}
              view={entry.canvasId === canvasId ? view : "canvas"}
              active={visible && !loading}
              onReady={markReady}
              onLoadError={handleLoadError}
            />
          </div>
        );
      })}

      {loading && (
        <>
          <div className="canvas-tab-loading-overlay">
            <span className="canvas-tab-loading-bar" />
            {loadError ? (
              <div className="canvas-tab-load-error" role="alert">
                <AlertTriangle />
                <strong>Couldn’t load this canvas</strong>
                <p>{loadError}</p>
                <span>
                  <button type="button" onClick={retry}><RotateCw /> Retry</button>
                  {displayedSurface && <button type="button" onClick={() => onNavigate(`/workflow/${displayedSurface.canvasId}`)}>Return to previous tab</button>}
                </span>
              </div>
            ) : (
              <div className="canvas-tab-loading-label">Loading workflow…</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
