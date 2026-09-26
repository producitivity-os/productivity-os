import type { CanvasRecord } from "@/data/canvases";

export type CanvasTypeFilter = "workflow" | "project";

export function filterLibraryCanvases(
  canvases: readonly CanvasRecord[],
  activeFilter: string,
): CanvasRecord[] {
  const workflows = canvases.filter(
    (canvas) => canvas.canvasType === "workflow",
  );
  if (activeFilter === "recents") return workflows;
  if (activeFilter === "drafts")
    return workflows.filter((canvas) => canvas.project === "Drafts");
  if (activeFilter.startsWith("folder:")) {
    return workflows.filter(
      (canvas) => canvas.project === activeFilter.slice("folder:".length),
    );
  }
  if (activeFilter.startsWith("type:")) {
    const type = activeFilter.slice("type:".length) as CanvasTypeFilter;
    return workflows.filter((canvas) => (canvas.workflowKind ?? "workflow") === type);
  }
  return [];
}

export function canvasLibraryFilterLabel(activeFilter: string): string {
  if (activeFilter === "recents") return "Recent workflows";
  if (activeFilter === "drafts") return "Drafts";
  if (activeFilter.startsWith("folder:"))
    return activeFilter.slice("folder:".length);
  if (activeFilter === "type:workflow") return "Workflows";
  if (activeFilter === "type:project") return "Projects";
  return "Workflows";
}
