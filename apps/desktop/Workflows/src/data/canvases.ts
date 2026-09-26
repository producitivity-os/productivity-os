export type CanvasRecord = {
  id: string;
  title: string;
  editedAt: string;
  project: string;
  icon: string;
  coverMediaId?: string | null;
  canvasType: "base" | "log" | "workflow";
  workflowKind: "workflow" | "project";
};

export const CANVAS_RECORDS: CanvasRecord[] = [
  {
    id: "workflow-product-launch",
    title: "Product launch",
    editedAt: "Edited 8 minutes ago",
    project: "Product",
    icon: "rocket",
    canvasType: "workflow",
    workflowKind: "project",
  },
  {
    id: "workflow-team-operations",
    title: "Team operations",
    editedAt: "Edited yesterday",
    project: "People",
    icon: "users",
    canvasType: "workflow",
    workflowKind: "workflow",
  },
];

export function canvasById(canvasId: string): CanvasRecord {
  return (
    CANVAS_RECORDS.find((canvas) => canvas.id === canvasId) ?? {
      id: canvasId,
      title: "Untitled workflow",
      editedAt: "Edited just now",
      project: "Drafts",
      icon: "file-text",
      canvasType: "workflow",
      workflowKind: "workflow",
    }
  );
}
