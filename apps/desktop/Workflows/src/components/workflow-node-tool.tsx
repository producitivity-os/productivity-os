import { SquarePlus } from "lucide-react";
import { Kbd } from "@productivity-os/shared-ui/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@productivity-os/shared-ui/components/ui/tooltip";
import type { BuiltInWorkflowNodeKind } from "@/features/workflow/nodes";
import type { CanvasDocumentSummary } from "@/api/canvas-data";

export type RememberedWorkflowNode =
  | { kind: BuiltInWorkflowNodeKind; target?: CanvasDocumentSummary }
  | { kind: "plugin"; pluginId: string; nodeType: string };

type WorkflowNodeToolProps = {
  active: boolean;
  onActivate(): void;
};

export function WorkflowNodeTool({ active, onActivate }: WorkflowNodeToolProps) {
  return (
    <div className="workflow-node-tool" data-active={active || undefined}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="canvas-toolbar-button" aria-label="Add node" aria-pressed={active} onClick={onActivate}>
            <SquarePlus />
          </button>
        </TooltipTrigger>
        <TooltipContent>Add node <Kbd>N</Kbd></TooltipContent>
      </Tooltip>
    </div>
  );
}
