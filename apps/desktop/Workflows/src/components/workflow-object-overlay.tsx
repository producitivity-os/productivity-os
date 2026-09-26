import type { CanvasObjectOverlaySlotProps } from "@productivity-os/canvas";
import { WorkflowTaskNodeOverlay } from "@/features/workflow/nodes/task/overlay";

export function WorkflowObjectOverlay(props: CanvasObjectOverlaySlotProps) {
  return <WorkflowTaskNodeOverlay {...props} />;
}
