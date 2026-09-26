import * as React from "react";
import {
  ChevronDown,
  FilePenLine,
  PanelLeftClose,
  PanelLeftOpen,
  Trash2,
  Grid3X3,
  Search,
  Toolbox,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
} from "@productivity-os/shared-ui/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@productivity-os/shared-ui/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@productivity-os/shared-ui/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@productivity-os/shared-ui/components/ui/alert-dialog";

import type { CanvasRecord } from "@/data/canvases";
import { WORKFLOW_NODE_CATALOG } from "@/features/workflow/nodes/catalog";
import type { RememberedWorkflowNode } from "@/components/workflow-node-tool";
import { workflowPluginDefinitions } from "@/plugins/workflow-plugin-registry";
import { useWorkflowPluginInstallations } from "@/plugins/workflow-plugin-installations";
import { writeWorkflowNodeDrag } from "@/features/workflow/nodes/drag";
import type { WorkflowPluginPalette } from "@productivity-os/workflow-plugin-sdk";
import playIcon from "@/assets/svg/play-1003-svgrepo-com.svg";

export type CanvasSidebarView = "canvas" | "plugins" | "settings";

type CanvasSidebarProps = {
  canvas: CanvasRecord;
  view: CanvasSidebarView;
  expanded: boolean;
  onExpandedChange(expanded: boolean): void;
  onNavigateCanvas(): void;
  onNavigatePlugins(): void;
  onRename(title: string): void;
  onDelete(): void;
  onChooseNode(choice: RememberedWorkflowNode): void;
};

function WorkflowNodeDrawer({ onChoose }: { onChoose(choice: RememberedWorkflowNode): void }) {
  const [query, setQuery] = React.useState("");
  const installed = useWorkflowPluginInstallations();
  const normalized = query.trim().toLocaleLowerCase();
  const coreGroups = [
    { id: "steps", label: "Steps", kinds: ["task", "timer"] },
    { id: "flow", label: "Flow", kinds: ["terminator", "milestone", "link"] },
  ] as const;
  const plugins = workflowPluginDefinitions(installed).filter(({ plugin, definition }) =>
    !normalized || `${plugin.manifest.app.name} ${plugin.manifest.name} ${definition.title} ${definition.description}`.toLocaleLowerCase().includes(normalized),
  );
  const appGroups = new Map<string, typeof plugins>();
  for (const entry of plugins) {
    const values = appGroups.get(entry.plugin.manifest.app.id) ?? [];
    values.push(entry);
    appGroups.set(entry.plugin.manifest.app.id, values);
  }
  return <div className="workflow-node-drawer">
    <label className="workflow-node-drawer-search"><Search /><input value={query} placeholder="Search nodes" onChange={(event) => setQuery(event.currentTarget.value)} /></label>
    {coreGroups.map((group) => {
      const choices = WORKFLOW_NODE_CATALOG.filter((item) => group.kinds.includes(item.kind as never)).filter((item) => !normalized || `${item.title} ${item.detail}`.toLocaleLowerCase().includes(normalized));
      if (!choices.length) return null;
      return <details key={group.id} open><summary>{group.label}</summary><div>{choices.map((item) => {
        const choice: RememberedWorkflowNode = { kind: item.kind };
        return <button key={item.kind} type="button" draggable aria-label={`Add ${item.title}`} onDragStart={(event) => writeWorkflowNodeDrag(event.dataTransfer, choice)} onClick={() => onChoose(choice)}><WorkflowNodeTrayPreview kind={item.kind} title={item.title} /></button>;
      })}</div></details>;
    })}
    {[...appGroups.values()].map((entries) => {
      const app = entries[0].plugin.manifest.app;
      const AppIcon = app.icon;
      return <details key={app.id} open><summary><AppIcon />{app.name}</summary><div>{entries.map(({ plugin, definition }) => {
        const choice: RememberedWorkflowNode = { kind: "plugin", pluginId: plugin.manifest.id, nodeType: definition.nodeType };
        const palette = app.palette ?? defaultPluginPalette;
        const Preview = definition.NodePickerPreview;
        return <button key={`${plugin.manifest.id}:${definition.nodeType}`} type="button" draggable aria-label={`Add ${definition.title}`} onDragStart={(event) => writeWorkflowNodeDrag(event.dataTransfer, choice)} onClick={() => onChoose(choice)}>{Preview ? <Preview palette={palette} /> : <WorkflowNodeTrayPreview kind="plugin" title={definition.title} appIcon={<AppIcon />} palette={palette} />}</button>;
      })}</div></details>;
    })}
  </div>;
}

function WorkflowNodeTrayPreview({
  kind,
  title,
  appIcon,
  palette,
}: {
  kind: string;
  title: string;
  appIcon?: React.ReactNode;
  palette?: WorkflowPluginPalette;
}) {
  if (kind === "terminator")
    return <span className="workflow-node-tray-preview is-terminator"><span>{title}</span></span>;
  return (
    <span className={`workflow-node-tray-preview is-${kind}`} style={palette ? {
      "--workflow-plugin-surface": palette.surface,
      "--workflow-plugin-border": palette.border,
      "--workflow-plugin-foreground": palette.foreground,
    } as React.CSSProperties : undefined}>
      <span className="workflow-node-tray-control" aria-hidden="true">
        {kind === "task" ? <i className="workflow-node-tray-checkbox" /> : kind === "timer" ? <i className="workflow-node-tray-play"><img src={playIcon} alt="" /></i> : appIcon}
      </span>
      <strong>{title}</strong>
      {kind === "timer" && <small>25:00</small>}
    </span>
  );
}

const defaultPluginPalette: WorkflowPluginPalette = {
  surface: "#f8fafc",
  border: "#3b82f6",
  foreground: "#172033",
  mutedForeground: "#64748b",
};

function RailButton({
  label,
  active,
  children,
  onClick,
}: {
  label: string;
  active?: boolean;
  children: React.ReactNode;
  onClick(): void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="canvas-rail-button"
          data-active={active || undefined}
          aria-label={label}
          onClick={onClick}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>{label}</TooltipContent>
    </Tooltip>
  );
}

function CanvasTitleMenu({
  canvas,
  onBeginRename,
  onDelete,
}: {
  canvas: CanvasRecord;
  onBeginRename(): void;
  onDelete(): void;
}) {
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  return (
    <div className="canvas-title-pill">
      <button type="button" className="canvas-title-name" onDoubleClick={onBeginRename}>
        <strong>{canvas.title}</strong>
      </button>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger className="canvas-title-chevron" aria-label="Edit file menu">
              <ChevronDown aria-hidden="true" />
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={1}>Edit file menu</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" sideOffset={7} className="canvas-title-menu">
          <DropdownMenuItem onClick={onBeginRename}><FilePenLine /> Rename<DropdownMenuShortcut>⌘R</DropdownMenuShortcut></DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}><Trash2 /> Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{canvas.title}”?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes the workflow and its stored media.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function CanvasSidebar(props: CanvasSidebarProps) {
  const {
    canvas, view, expanded, onExpandedChange, onNavigateCanvas,
    onNavigatePlugins, onRename, onDelete, onChooseNode,
  } = props;
  const [renaming, setRenaming] = React.useState(false);
  const [draftTitle, setDraftTitle] = React.useState(canvas.title);
  React.useEffect(() => setDraftTitle(canvas.title), [canvas.title]);

  const commitRename = () => {
    const nextTitle = draftTitle.trim();
    if (nextTitle) onRename(nextTitle); else setDraftTitle(canvas.title);
    setRenaming(false);
  };

  return (
    <Sidebar collapsible="none" className={`canvas-sidebar${expanded ? "" : " is-collapsed"}`}>
      <div className="canvas-sidebar-layout">
        <nav className="canvas-sidebar-rail" aria-label="Workflow navigation">
          <RailButton label="Current workflow" active={view === "canvas"} onClick={onNavigateCanvas}><Grid3X3 /></RailButton>
          <RailButton label="Plugins" active={view === "plugins"} onClick={onNavigatePlugins}><Toolbox /></RailButton>
          <span className="canvas-rail-spacer" />
          {!expanded && <RailButton label="Expand panel" onClick={() => onExpandedChange(true)}><PanelLeftOpen /></RailButton>}
        </nav>

        <div className="canvas-sidebar-panel">
          <SidebarHeader className="canvas-sidebar-panel-header">
            {renaming ? (
              <form className="canvas-rename-form" onSubmit={(event) => { event.preventDefault(); commitRename(); }}>
                <input autoFocus value={draftTitle} aria-label="Workflow title" onChange={(event) => setDraftTitle(event.currentTarget.value)} onBlur={commitRename} onKeyDown={(event) => { if (event.key === "Escape") { setDraftTitle(canvas.title); setRenaming(false); } }} />
              </form>
            ) : (
              <div className="canvas-title-row">
                <CanvasTitleMenu canvas={canvas} onBeginRename={() => setRenaming(true)} onDelete={onDelete} />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="canvas-title-collapse" aria-label="Collapse sidebar" onClick={() => onExpandedChange(false)}><PanelLeftClose /></button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" sideOffset={1}>Collapse sidebar</TooltipContent>
                </Tooltip>
              </div>
            )}
          </SidebarHeader>

          <SidebarContent className="canvas-sidebar-scroll">
            <WorkflowNodeDrawer onChoose={onChooseNode} />
          </SidebarContent>
        </div>
      </div>
    </Sidebar>
  );
}
