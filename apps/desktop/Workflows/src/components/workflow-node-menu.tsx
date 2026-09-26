import * as React from "react";
import { ChevronRight } from "lucide-react";
import type { CanvasDocumentSummary } from "@/api/canvas-data";
import { WORKFLOW_NODE_CATALOG, workflowNodeCatalogItem } from "@/features/workflow/nodes/catalog.ts";
import type { RememberedWorkflowNode } from "./workflow-node-tool";
import { workflowPluginDefinitions } from "@/plugins/workflow-plugin-registry";
import { useWorkflowPluginInstallations } from "@/plugins/workflow-plugin-installations";

type WorkflowNodeMenuProps = {
  position: { x: number; y: number };
  canvases: readonly CanvasDocumentSummary[];
  currentCanvasId: string;
  onChoose(choice: RememberedWorkflowNode): void;
  onCancel(): void;
};

export function WorkflowNodeMenu({ position, canvases, currentCanvasId, onChoose, onCancel }: WorkflowNodeMenuProps) {
  const [linksOpen, setLinksOpen] = React.useState(false);
  const installedIds = useWorkflowPluginInstallations();
  const plugins = workflowPluginDefinitions(installedIds);
  const workflowTargets = canvases.filter((canvas) => canvas.canvasType === "workflow" && canvas.id !== currentCanvasId);
  return (
    <div className="workflow-node-menu-backdrop" onPointerDown={onCancel}>
      <div className="workflow-node-menu" style={{ left: position.x, top: position.y }} onPointerDown={(event) => event.stopPropagation()}>
        {WORKFLOW_NODE_CATALOG.filter((item) => item.kind !== "link").map((item) => (
          <NodeButton key={item.kind} icon={<item.icon />} title={item.title} onClick={() => onChoose({ kind: item.kind })} />
        ))}
        {plugins.map(({ plugin, definition }) => (
          <NodeButton key={`${plugin.manifest.id}:${definition.nodeType}`} icon={<definition.icon />} title={definition.title} onClick={() => onChoose({ kind: "plugin", pluginId: plugin.manifest.id, nodeType: definition.nodeType })} />
        ))}
        <div className="workflow-node-link-menu" onPointerEnter={() => setLinksOpen(true)} onPointerLeave={() => setLinksOpen(false)}>
          <button type="button" aria-haspopup="menu" aria-expanded={linksOpen} onClick={() => setLinksOpen((open) => !open)}>
            {(() => { const item = workflowNodeCatalogItem("link"); const Icon = item.icon; return <><Icon /><span><strong>{item.title}</strong></span></>; })()}
            <ChevronRight className="workflow-node-menu-chevron" />
          </button>
          {linksOpen && (
            <div className="workflow-node-destination-menu" role="menu">
              <button type="button" onClick={() => onChoose({ kind: "link" })}><span><strong>Not linked</strong></span></button>
              {workflowTargets.map((canvas) => <button key={canvas.id} type="button" role="menuitem" onClick={() => onChoose({ kind: "link", target: canvas })}><span><strong>{canvas.title}</strong></span></button>)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NodeButton({ icon, title, onClick }: { icon: React.ReactNode; title: string; onClick(): void }) {
  return <button type="button" onClick={onClick}>{icon}<span><strong>{title}</strong></span></button>;
}
