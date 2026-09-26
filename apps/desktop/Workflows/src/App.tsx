import * as React from "react";
import {
  Blocks,
  Check,
  FilePenLine,
  Folder,
  FolderInput,
  FolderOpen,
  Home,
  PanelLeft,
  Pencil,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
} from "lucide-react";
import {
  Navigate,
  Route,
  Routes,
  matchPath,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  WorkspaceAppHeader,
  type AppHeaderTab,
} from "@productivity-os/shared-ui/components/app-header";
import {
  CommandPalette,
  type SharedCommand,
} from "@productivity-os/shared-ui/components/command-palette";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@productivity-os/shared-ui/components/ui/context-menu";
import { Toaster } from "@productivity-os/shared-ui/components/ui/toaster";
import { toast } from "@productivity-os/shared-ui/hooks/use-toast";
import { IconGlyph } from "@productivity-os/shared-ui/components/icon-select";
import {
  DataServiceRecoveryDialog,
  clearDataServiceIssue,
  reportDataServiceIssue,
  useDataServiceIssue,
} from "@productivity-os/shared-ui/components/data-service-recovery";
import type { CanvasTool } from "@productivity-os/canvas";

import { AppLayout } from "@/layouts/AppLayout";
import {
  CanvasPropertiesDialog,
  type CanvasProperties,
} from "@/components/canvas-properties-dialog";
import { CanvasTabHost } from "@/components/canvas-tab-host";
import { Index } from "@/pages/Index";
import { CANVAS_RECORDS, canvasById, type CanvasRecord } from "@/data/canvases";
import {
  createEmptyCanvasState,
  createInitialCanvasState,
} from "@/data/canvas-defaults";
import {
  updateWorkflowSummaryTitle,
  updateWorkflowTabTitle,
} from "@/data/workflow-title-state";
import {
  canvasToSnapshot,
  isTauriRuntime,
  canvasData,
  type CanvasDocumentSummary,
} from "@/api/canvas-data";

type PaletteMode = "commands" | "canvases" | null;
const CUSTOM_FOLDERS_STORAGE_KEY = "productivity-os.workflows.custom-folders";

function storedCustomFolders(): string[] {
  try {
    const value: unknown = JSON.parse(
      window.localStorage.getItem(CUSTOM_FOLDERS_STORAGE_KEY) ?? "[]",
    );
    return Array.isArray(value)
      ? value.filter((folder): folder is string => typeof folder === "string")
      : [];
  } catch {
    return [];
  }
}

function tabForCanvas(
  canvasId: string,
  title?: string,
  icon?: string,
): AppHeaderTab {
  const fallback = canvasById(canvasId);
  return {
    id: canvasId,
    label: title || fallback.title,
    icon: <IconGlyph name={icon ?? fallback.icon} />,
  };
}

export function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const dataServiceIssue = useDataServiceIssue();
  const routeMatch = matchPath(
    { path: "/workflow/:canvasId/*", end: false },
    location.pathname,
  );
  const activeCanvasId = routeMatch?.params.canvasId;
  const [notificationCount, setNotificationCount] = React.useState(3);
  const [canvases, setCanvases] = React.useState<CanvasDocumentSummary[]>([]);
  const [customFolders, setCustomFolders] =
    React.useState<string[]>(storedCustomFolders);
  const [loadingCanvases, setLoadingCanvases] = React.useState(true);
  const [paletteMode, setPaletteMode] = React.useState<PaletteMode>(null);
  const [tabs, setTabs] = React.useState<AppHeaderTab[]>([]);
  const [contextCanvasId, setContextCanvasId] = React.useState<string | null>(
    null,
  );
  const [renamingCanvasId, setRenamingCanvasId] = React.useState<string | null>(
    null,
  );
  const [editingCanvasId, setEditingCanvasId] = React.useState<string | null>(
    null,
  );
  const [creatingCanvas, setCreatingCanvas] = React.useState(false);
  const renameRequestedRef = React.useRef(false);
  const closedTabIdsRef = React.useRef(new Set<string>());
  const previousActiveCanvasIdRef = React.useRef<string | undefined>(
    activeCanvasId,
  );
  const canvasExitHandlerRef = React.useRef<(() => Promise<void>) | null>(null);
  const starredIds = React.useMemo(
    () =>
      new Set(
        canvases.filter((canvas) => canvas.starred).map((canvas) => canvas.id),
      ),
    [canvases],
  );
  const contextCanvas = contextCanvasId
    ? canvases.find((canvas) => canvas.id === contextCanvasId)
    : undefined;
  const editingCanvas = editingCanvasId
    ? (canvases.find((canvas) => canvas.id === editingCanvasId) ?? null)
    : null;
  const canvasFolders = React.useMemo(
    () =>
      Array.from(
        new Set([
          "Drafts",
          "Product",
          "Research",
          "Design",
          ...customFolders,
          ...canvases.map((canvas) => canvas.project),
        ]),
      ).sort((left, right) => left.localeCompare(right)),
    [customFolders, canvases],
  );

  const createFolder = React.useCallback((name: string) => {
    setCustomFolders((current) => {
      if (
        current.some(
          (folder) => folder.toLocaleLowerCase() === name.toLocaleLowerCase(),
        )
      )
        return current;
      const next = [...current, name].sort((left, right) =>
        left.localeCompare(right),
      );
      try {
        window.localStorage.setItem(
          CUSTOM_FOLDERS_STORAGE_KEY,
          JSON.stringify(next),
        );
      } catch {
        // The folder still remains available for this session when storage is unavailable.
      }
      return next;
    });
  }, []);

  const registerCanvasExit = React.useCallback(
    (handler: (() => Promise<void>) | null) => {
      canvasExitHandlerRef.current = handler;
    },
    [],
  );

  const navigateSafely = React.useCallback(
    (path: string) => {
      const handler = canvasExitHandlerRef.current;
      canvasExitHandlerRef.current = null;
      if (handler)
        void handler().catch((error) => {
          toast({
            title: "Workflow exit save failed",
            description: error instanceof Error ? error.message : String(error),
          });
        });
      navigate(path);
    },
    [navigate],
  );

  React.useEffect(() => {
    if (!isTauriRuntime) return;
    void import("@tauri-apps/api/core")
      .then(({ invoke }) =>
        invoke<{ canvasId: string; objectId: string | null } | null>(
          "initial_navigation",
        ),
      )
      .then((target) => {
        if (!target?.canvasId) return;
        if (target.objectId)
          window.sessionStorage.setItem(
            "canvas:source-object",
            target.objectId,
          );
        navigateSafely(`/workflow/${target.canvasId}`);
      })
      .catch(() => undefined);
  }, [navigateSafely]);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const status = await canvasData.status();
        if (isTauriRuntime && !status.connected) {
          reportDataServiceIssue(
            status.error ?? "The shared data service is unavailable.",
          );
          return;
        }
        if (
          status.activeSettings?.canvasSeedDemoData ??
          status.configuredSettings?.canvasSeedDemoData ??
          true
        ) {
          await canvasData.seed(
            CANVAS_RECORDS.map((canvas) => ({
              id: canvas.id,
              title: canvas.title,
              project: canvas.project,
              canvasType: canvas.canvasType,
              workflowKind: canvas.workflowKind ?? "workflow",
              icon: canvas.icon,
              starred: false,
              coverMediaId: null,
              expectedRevision: null,
              canvas: canvasToSnapshot(createInitialCanvasState(canvas.id)),
            })),
          );
        }
        const records = (await canvasData.list()).filter(
          (record) => record.canvasType === "workflow",
        );
        if (cancelled) return;
        setCanvases(records);
        setTabs(
          records
            .slice(0, 2)
            .map((canvas) =>
              tabForCanvas(canvas.id, canvas.title, canvas.icon),
            ),
        );
      } catch (error) {
        reportDataServiceIssue(error);
      } finally {
        if (!cancelled) setLoadingCanvases(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const refreshCanvasSummaries = () => {
      void canvasData.list().then((records) => {
        if (!cancelled)
          setCanvases(records.filter((record) => record.canvasType === "workflow"));
      }).catch(() => undefined);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshCanvasSummaries();
    };
    window.addEventListener("focus", refreshCanvasSummaries);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refreshCanvasSummaries);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  React.useEffect(() => {
    if (!activeCanvasId) return;
    if (closedTabIdsRef.current.has(activeCanvasId)) return;
    const activeCanvas = canvases.find(
      (canvas) => canvas.id === activeCanvasId,
    );
    setTabs((currentTabs) => {
      if (!currentTabs.some((tab) => tab.id === activeCanvasId)) {
        return [
          ...currentTabs,
          tabForCanvas(activeCanvasId, activeCanvas?.title, activeCanvas?.icon),
        ];
      }
      if (!activeCanvas) return currentTabs;
      return currentTabs.map((tab) =>
        tab.id === activeCanvasId
          ? {
              ...tab,
              label: activeCanvas.title,
              icon: <IconGlyph name={activeCanvas.icon} />,
            }
          : tab,
      );
    });
  }, [activeCanvasId, canvases]);

  React.useEffect(() => {
    const previous = previousActiveCanvasIdRef.current;
    if (previous && previous !== activeCanvasId)
      closedTabIdsRef.current.delete(previous);
    previousActiveCanvasIdRef.current = activeCanvasId;
  }, [activeCanvasId]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        !(event.metaKey || event.ctrlKey) ||
        event.altKey ||
        event.shiftKey
      )
        return;
      const key = event.key.toLowerCase();
      if (key !== "p" && key !== "o") return;
      event.preventDefault();
      setPaletteMode(key === "p" ? "commands" : "canvases");
    };
    const openPalette = () => setPaletteMode("commands");
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("workflows:open-command-palette", openPalette);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("workflows:open-command-palette", openPalette);
    };
  }, []);

  React.useEffect(() => {
    if (!isTauriRuntime) return undefined;
    let unlisten: (() => void) | undefined;
    const importWorkflow = async () => {
      try {
        const [{ open }, { invoke }] = await Promise.all([
          import("@tauri-apps/plugin-dialog"),
          import("@tauri-apps/api/core"),
        ]);
        const path = await open({
          multiple: false,
          directory: false,
          filters: [
            { name: "Workflow exports", extensions: ["canvas", "json"] },
          ],
        });
        if (typeof path !== "string") return;
        const file = await invoke<{ name: string; content: string }>(
          "read_canvas_import",
          { path },
        );
        const parsed: unknown = JSON.parse(file.content);
        if (!parsed || typeof parsed !== "object")
          throw new Error(
            "The selected file does not contain a workflow object.",
          );
        toast({
          title: "Workflow export recognized",
          description: `${file.name} is ready; format conversion will be added with the workflow schema adapter.`,
        });
      } catch (error) {
        toast({
          title: "Couldn’t inspect workflow export",
          description: error instanceof Error ? error.message : String(error),
        });
      }
    };
    void import("@tauri-apps/api/event")
      .then(({ listen }) =>
        listen("workflows:native-import-workflow", () => void importWorkflow()),
      )
      .then((cleanup) => {
        unlisten = cleanup;
      });
    return () => unlisten?.();
  }, []);

  const toggleStar = React.useCallback(
    (canvasId: string) => {
      const starred = !canvases.find((canvas) => canvas.id === canvasId)
        ?.starred;
      setCanvases((current) =>
        current.map((canvas) =>
          canvas.id === canvasId ? { ...canvas, starred } : canvas,
        ),
      );
      void canvasData
        .setStarred(canvasId, starred)
        .then((updated) => {
          if (updated)
            setCanvases((current) =>
              current.map((canvas) =>
                canvas.id === canvasId ? updated : canvas,
              ),
            );
        })
        .catch((error) => {
          setCanvases((current) =>
            current.map((canvas) =>
              canvas.id === canvasId
                ? { ...canvas, starred: !starred }
                : canvas,
            ),
          );
          toast({
            title: "Couldn’t update favorite",
            description: error instanceof Error ? error.message : String(error),
          });
        });
    },
    [canvases],
  );

  const openCreateCanvas = React.useCallback(() => {
    setPaletteMode(null);
    setCreatingCanvas(true);
  }, []);

  const createCanvas = React.useCallback(
    async (properties: CanvasProperties) => {
      const canvasId = `workflow-${crypto.randomUUID()}`;
      try {
        const summary = await canvasData.save({
          id: canvasId,
          title: properties.title,
          project: properties.project,
          canvasType: properties.canvasType,
          workflowKind: properties.workflowKind,
          icon: properties.icon,
          starred: false,
          coverMediaId: properties.coverMediaId,
          expectedRevision: null,
          canvas: canvasToSnapshot(
            createEmptyCanvasState(properties.canvasType),
          ),
        });
        setCanvases((current) => [summary, ...current]);
        setTabs((current) => [
          ...current,
          tabForCanvas(canvasId, summary.title, summary.icon),
        ]);
        navigateSafely(`/workflow/${canvasId}`);
        toast({ title: "Workflow created", description: summary.title });
      } catch (error) {
        toast({
          title: "Couldn’t create workflow",
          description: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    [navigateSafely],
  );

  const renameCanvas = React.useCallback(
    (canvasId: string, title: string) => {
      const canvas = canvases.find((candidate) => candidate.id === canvasId);
      if (!canvas) return;
      const nextTitle = title.trim();
      setRenamingCanvasId(null);
      if (!nextTitle || nextTitle === canvas.title) return;
      setCanvases((current) =>
        current.map((candidate) =>
          candidate.id === canvasId
            ? { ...candidate, title: nextTitle }
            : candidate,
        ),
      );
      setTabs((current) =>
        current.map((tab) =>
          tab.id === canvasId ? { ...tab, label: nextTitle } : tab,
        ),
      );
      void canvasData
        .setTitle(canvasId, nextTitle)
        .then((updated) => {
          if (!updated) throw new Error("Workflow no longer exists.");
          setCanvases((current) =>
            current.map((candidate) =>
              candidate.id === canvasId ? updated : candidate,
            ),
          );
          setTabs((current) =>
            current.map((tab) =>
              tab.id === canvasId ? { ...tab, label: updated.title } : tab,
            ),
          );
        })
        .catch((error) => {
          setCanvases((current) =>
            current.map((candidate) =>
              candidate.id === canvasId ? canvas : candidate,
            ),
          );
          setTabs((current) =>
            current.map((tab) =>
              tab.id === canvasId ? { ...tab, label: canvas.title } : tab,
            ),
          );
          toast({
            title: "Couldn’t rename workflow",
            description: error instanceof Error ? error.message : String(error),
          });
        });
    },
    [canvases],
  );

  const saveCanvasProperties = React.useCallback(
    async (properties: CanvasProperties) => {
      if (!editingCanvasId) return;
      try {
        const updated = await canvasData.updateProperties(
          editingCanvasId,
          properties,
        );
        if (!updated) throw new Error("Workflow no longer exists.");
        setCanvases((current) =>
          current.map((canvas) =>
            canvas.id === editingCanvasId ? updated : canvas,
          ),
        );
        setTabs((current) =>
          current.map((tab) =>
            tab.id === editingCanvasId
              ? {
                  ...tab,
                  label: updated.title,
                  icon: <IconGlyph name={updated.icon} />,
                }
              : tab,
          ),
        );
        toast({
          title: "Workflow properties updated",
          description: updated.title,
        });
      } catch (error) {
        toast({
          title: "Couldn’t update workflow",
          description: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    [editingCanvasId],
  );

  const moveCanvas = React.useCallback(
    (canvasId: string, project: string) => {
      const previous = canvases.find((canvas) => canvas.id === canvasId);
      if (!previous || previous.project === project) return;
      setCanvases((current) =>
        current.map((canvas) =>
          canvas.id === canvasId ? { ...canvas, project } : canvas,
        ),
      );
      void canvasData
        .moveToProject(canvasId, project)
        .then((updated) => {
          if (!updated) throw new Error("Workflow no longer exists.");
          setCanvases((current) =>
            current.map((canvas) =>
              canvas.id === canvasId ? updated : canvas,
            ),
          );
          toast({ title: `Moved to ${project}`, description: previous.title });
        })
        .catch((error) => {
          setCanvases((current) =>
            current.map((canvas) =>
              canvas.id === canvasId ? previous : canvas,
            ),
          );
          toast({
            title: "Couldn’t move workflow",
            description: error instanceof Error ? error.message : String(error),
          });
        });
    },
    [canvases],
  );

  const deleteCanvas = React.useCallback(
    (canvasId: string) => {
      const canvas = canvases.find((candidate) => candidate.id === canvasId);
      if (!canvas) return;
      void canvasData
        .delete(canvasId)
        .then((deleted) => {
          if (!deleted) throw new Error("Workflow no longer exists.");
          setCanvases((current) =>
            current.filter((candidate) => candidate.id !== canvasId),
          );
          setTabs((current) => current.filter((tab) => tab.id !== canvasId));
          setRenamingCanvasId((current) =>
            current === canvasId ? null : current,
          );
          setEditingCanvasId((current) =>
            current === canvasId ? null : current,
          );
          if (activeCanvasId === canvasId) {
            closedTabIdsRef.current.add(canvasId);
            navigateSafely("/");
          }
          toast({ title: "Workflow deleted", description: canvas.title });
        })
        .catch((error) =>
          toast({
            title: "Couldn’t delete workflow",
            description: error instanceof Error ? error.message : String(error),
          }),
        );
    },
    [activeCanvasId, navigateSafely, canvases],
  );

  const closeTab = React.useCallback(
    (canvasId: string) => {
      const closingIndex = tabs.findIndex((tab) => tab.id === canvasId);
      const remaining = tabs.filter((tab) => tab.id !== canvasId);
      setTabs(remaining);
      if (activeCanvasId === canvasId) {
        closedTabIdsRef.current.add(canvasId);
        const next =
          remaining[Math.min(Math.max(closingIndex, 0), remaining.length - 1)];
        navigateSafely(next ? `/workflow/${next.id}` : "/");
      }
    },
    [activeCanvasId, navigateSafely, tabs],
  );

  React.useEffect(() => {
    const closeActiveTab = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        !(event.metaKey || event.ctrlKey) ||
        event.altKey ||
        event.shiftKey ||
        event.key.toLocaleLowerCase() !== "w" ||
        !activeCanvasId
      )
        return;
      event.preventDefault();
      closeTab(activeCanvasId);
    };
    window.addEventListener("keydown", closeActiveTab);
    return () => window.removeEventListener("keydown", closeActiveTab);
  }, [activeCanvasId, closeTab]);

  const closeOtherTabs = React.useCallback(
    (canvasId: string) => {
      if (activeCanvasId && activeCanvasId !== canvasId)
        closedTabIdsRef.current.add(activeCanvasId);
      setTabs((current) => current.filter((tab) => tab.id === canvasId));
      if (activeCanvasId !== canvasId) navigateSafely(`/workflow/${canvasId}`);
    },
    [activeCanvasId, navigateSafely],
  );

  const closeTabsToRight = React.useCallback(
    (canvasId: string) => {
      const index = tabs.findIndex((tab) => tab.id === canvasId);
      const next = index < 0 ? tabs : tabs.slice(0, index + 1);
      if (activeCanvasId && !next.some((tab) => tab.id === activeCanvasId))
        closedTabIdsRef.current.add(activeCanvasId);
      setTabs(next);
      if (activeCanvasId && !next.some((tab) => tab.id === activeCanvasId))
        navigateSafely(`/workflow/${canvasId}`);
    },
    [activeCanvasId, navigateSafely, tabs],
  );

  const updateTabTitle = React.useCallback(
    (canvasId: string, title: string) => {
      setCanvases((current) =>
        updateWorkflowSummaryTitle(current, canvasId, title),
      );
      setTabs((current) =>
        updateWorkflowTabTitle(current, canvasId, title, () =>
          tabForCanvas(canvasId, title),
        ),
      );
    },
    [],
  );

  const updateCanvasPreview = React.useCallback(
    (canvasId: string, previewDataUrl: string) => {
      setCanvases((current) =>
        current.map((canvas) =>
          canvas.id === canvasId ? { ...canvas, previewDataUrl } : canvas,
        ),
      );
    },
    [],
  );

  const canvasCommands = React.useMemo<SharedCommand[]>(() => {
    const records = new Map<string, CanvasRecord>();
    for (const canvas of canvases)
      records.set(canvas.id, {
        id: canvas.id,
        title: canvas.title,
        project: canvas.project,
        icon: canvas.icon,
        canvasType: canvas.canvasType,
        workflowKind: canvas.workflowKind,
        editedAt: "Edited recently",
        coverMediaId: canvas.coverMediaId,
      });
    for (const tab of tabs)
      records.set(tab.id, { ...canvasById(tab.id), title: tab.label });
    return [...records.values()].map((canvas) => ({
      id: `open-${canvas.id}`,
      label: canvas.title,
      group: "Workflows",
      keywords: `${canvas.project} ${canvas.id}`,
      icon: <IconGlyph name={canvas.icon} />,
      onSelect: () => navigateSafely(`/workflow/${canvas.id}`),
    }));
  }, [navigateSafely, tabs, canvases]);

  const commandPaletteCommands = React.useMemo<SharedCommand[]>(() => {
    const canvasId = activeCanvasId ?? tabs[0]?.id ?? CANVAS_RECORDS[0].id;
    const dispatchTool = (tool: CanvasTool) =>
      window.dispatchEvent(
        new CustomEvent("workflows:set-canvas-tool", { detail: tool }),
      );
    return [
      {
        id: "home",
        label: "Go home",
        group: "Navigation",
        icon: <Home />,
        onSelect: () => navigateSafely("/"),
      },
      {
        id: "open-canvas",
        label: "Open workflow…",
        group: "Navigation",
        shortcut: "⌘O",
        icon: <FolderOpen />,
        onSelect: () => setPaletteMode("canvases"),
      },
      {
        id: "new-canvas",
        label: "New workflow",
        group: "Navigation",
        icon: <Plus />,
        onSelect: openCreateCanvas,
      },
      {
        id: "plugins",
        label: "Open plugins",
        group: "Navigation",
        icon: <Blocks />,
        onSelect: () => navigateSafely(`/workflow/${canvasId}/plugins`),
      },
      {
        id: "settings",
        label: "Open settings",
        group: "Navigation",
        icon: <Settings2 />,
        onSelect: () =>
          navigateSafely(
            activeCanvasId ? `/workflow/${canvasId}/settings` : "/settings",
          ),
      },
      {
        id: "toggle-sidebar",
        label: "Toggle sidebar",
        group: "View",
        shortcut: "⌘B",
        icon: <PanelLeft />,
        onSelect: () =>
          window.dispatchEvent(
            new KeyboardEvent("keydown", { key: "b", metaKey: true }),
          ),
      },
      ...(
        [
          "select",
          "hand",
          "text",
          "card",
          "markdown-card",
          "rect",
          "arrow",
          "pencil",
          "image",
          "video",
        ] as CanvasTool[]
      ).map((tool) => ({
        id: `tool-${tool}`,
        label: `Select ${tool === "pencil" ? "freehand" : tool} tool`,
        group: "Workflow tools",
        keywords: tool,
        disabled:
          !activeCanvasId || !location.pathname.endsWith(activeCanvasId),
        onSelect: () => dispatchTool(tool),
      })),
    ];
  }, [
    activeCanvasId,
    location.pathname,
    navigateSafely,
    openCreateCanvas,
    tabs,
  ]);

  const defaultCanvasId = activeCanvasId ?? tabs[0]?.id ?? CANVAS_RECORDS[0].id;
  const activeCanvasView = location.pathname.endsWith("/plugins")
    ? "plugins"
    : location.pathname.endsWith("/settings")
      ? "settings"
      : "canvas";

  return (
    <>
      <DataServiceRecoveryDialog
        issue={dataServiceIssue}
        onRetry={() => {
          clearDataServiceIssue();
          window.location.reload();
        }}
        onClose={() => {
          if (isTauriRuntime)
            void import("@tauri-apps/api/window").then(({ getCurrentWindow }) =>
              getCurrentWindow().close(),
            );
          else window.close();
        }}
      />
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className="canvas-context-root"
          onContextMenu={(event) => {
            const target =
              event.target instanceof Element
                ? event.target.closest<HTMLElement>("[data-canvas-id]")
                : null;
            setContextCanvasId(target?.dataset.canvasId ?? null);
          }}
        >
          <AppLayout>
            <WorkspaceAppHeader
              homeLabel="Workflows home"
              homeActive={location.pathname === "/"}
              onHomeSelect={() => navigateSafely("/")}
              tabs={tabs}
              activeTabId={activeCanvasId}
              onTabSelect={(canvasId) =>
                navigateSafely(`/workflow/${canvasId}`)
              }
              onTabClose={closeTab}
              onTabCloseOthers={closeOtherTabs}
              onTabCloseToRight={closeTabsToRight}
              onTabsReorder={setTabs}
              addTab={{ label: "New workflow tab", onAdd: openCreateCanvas }}
              notificationLabel="Notifications"
              notificationCount={notificationCount}
              onNotificationsSelect={() => {
                setNotificationCount(0);
                toast({
                  title: "You’re all caught up",
                  description: "There are no new Workflows notifications.",
                });
              }}
              menuLabel="Workflows menu"
              menuItems={[
                {
                  id: "commands",
                  label: "Command palette",
                  onSelect: () => setPaletteMode("commands"),
                },
                {
                  id: "canvases",
                  label: "Open workflow",
                  onSelect: () => setPaletteMode("canvases"),
                },
                {
                  id: "settings",
                  label: "Settings",
                  onSelect: () =>
                    navigateSafely(
                      activeCanvasId
                        ? `/workflow/${activeCanvasId}/settings`
                        : "/settings",
                    ),
                },
                { id: "about-separator", type: "separator" },
                {
                  id: "about",
                  label: "About Workflows",
                  disabled: true,
                },
              ]}
            />

            <div className="canvas-route-viewport">
              <Routes>
                <Route
                  path="/"
                  element={
                    <Index
                      canvases={canvases}
                      loading={loadingCanvases}
                      starredIds={starredIds}
                      onStarToggle={toggleStar}
                      folders={canvasFolders}
                      onCreateFolder={createFolder}
                      renamingCanvasId={renamingCanvasId}
                      onRenameCommit={renameCanvas}
                      onRenameCancel={() => setRenamingCanvasId(null)}
                      onCreateCanvas={openCreateCanvas}
                    />
                  }
                />
                <Route
                  path="/settings"
                  element={
                    <Index
                      canvases={canvases}
                      loading={loadingCanvases}
                      page="settings"
                      starredIds={starredIds}
                      onStarToggle={toggleStar}
                      folders={canvasFolders}
                      onCreateFolder={createFolder}
                      renamingCanvasId={renamingCanvasId}
                      onRenameCommit={renameCanvas}
                      onRenameCancel={() => setRenamingCanvasId(null)}
                      onCreateCanvas={openCreateCanvas}
                    />
                  }
                />
                <Route
                  path="/media"
                  element={
                    <Index
                      canvases={canvases}
                      loading={loadingCanvases}
                      page="media"
                      starredIds={starredIds}
                      onStarToggle={toggleStar}
                      folders={canvasFolders}
                      onCreateFolder={createFolder}
                      renamingCanvasId={renamingCanvasId}
                      onRenameCommit={renameCanvas}
                      onRenameCancel={() => setRenamingCanvasId(null)}
                      onCreateCanvas={openCreateCanvas}
                    />
                  }
                />
                <Route
                  path="/resources"
                  element={<Navigate to="/media" replace />}
                />
                <Route
                  path="/workflow/:canvasId/*"
                  element={
                    <CanvasTabHost
                      canvasId={activeCanvasId ?? defaultCanvasId}
                      view={activeCanvasView}
                      canvases={canvases}
                      starredIds={starredIds}
                      onDelete={deleteCanvas}
                      onTitleChange={updateTabTitle}
                      onPreviewChange={updateCanvasPreview}
                      onNavigate={navigateSafely}
                      onRegisterCanvasExit={registerCanvasExit}
                    />
                  }
                />
                <Route
                  path="/plugins"
                  element={
                    <Navigate
                      to={`/workflow/${defaultCanvasId}/plugins`}
                      replace
                    />
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
          </AppLayout>
          <CommandPalette
            open={paletteMode !== null}
            onOpenChange={(open) => {
              if (!open) setPaletteMode(null);
            }}
            commands={
              paletteMode === "canvases"
                ? canvasCommands
                : commandPaletteCommands
            }
            title={
              paletteMode === "canvases" ? "Open workflow" : "Command palette"
            }
            placeholder={
              paletteMode === "canvases"
                ? "Search workflows…"
                : "Type a command…"
            }
            emptyMessage={
              paletteMode === "canvases"
                ? "No workflows found."
                : "No commands found."
            }
          />
          <CanvasPropertiesDialog
            mode={creatingCanvas ? "create" : "edit"}
            open={creatingCanvas || Boolean(editingCanvas)}
            canvas={editingCanvas}
            folders={canvasFolders}
            onOpenChange={(open) => {
              if (open) return;
              setCreatingCanvas(false);
              setEditingCanvasId(null);
            }}
            onSave={creatingCanvas ? createCanvas : saveCanvasProperties}
          />
          <Toaster />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent
        onCloseAutoFocus={(event) => {
          if (!renameRequestedRef.current) return;
          event.preventDefault();
          renameRequestedRef.current = false;
        }}
      >
        {contextCanvas ? (
          <>
            <ContextMenuItem
              onSelect={() => navigateSafely(`/workflow/${contextCanvas.id}`)}
            >
              <FolderOpen /> Open
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() => setEditingCanvasId(contextCanvas.id)}
            >
              <Pencil /> Edit
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() => {
                renameRequestedRef.current = true;
                setRenamingCanvasId(contextCanvas.id);
              }}
            >
              <FilePenLine /> Rename
            </ContextMenuItem>
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <FolderInput /> Move to folder
              </ContextMenuSubTrigger>
              <ContextMenuSubContent>
                {canvasFolders.map((folder) => (
                  <ContextMenuItem
                    key={folder}
                    disabled={folder === contextCanvas.project}
                    onSelect={() => moveCanvas(contextCanvas.id, folder)}
                  >
                    {folder === contextCanvas.project ? <Check /> : <Folder />}
                    {folder}
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
            <ContextMenuSeparator />
            <ContextMenuItem
              variant="destructive"
              onSelect={() => {
                const canvasId = contextCanvas.id;
                setContextCanvasId(null);
                deleteCanvas(canvasId);
              }}
            >
              <Trash2 /> Delete
            </ContextMenuItem>
          </>
        ) : (
          <ContextMenuItem onSelect={() => window.location.reload()}>
            <RefreshCw /> Refresh
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
    </>
  );
}
