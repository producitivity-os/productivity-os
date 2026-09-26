import * as React from "react";
import { ChevronDown } from "lucide-react";

type CanvasSidebarSectionProps = {
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?(open: boolean): void;
  className?: string;
};

export function CanvasSidebarSection({
  title,
  children,
  actions,
  open,
  defaultOpen = true,
  onOpenChange,
  className = "",
}: CanvasSidebarSectionProps) {
  const contentId = React.useId();
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const expanded = open ?? internalOpen;

  const setExpanded = (nextOpen: boolean) => {
    if (open === undefined) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  return (
    <section className={`canvas-sidebar-section ${className}`}>
      <div className="canvas-sidebar-section-header">
        <button
          type="button"
          className="canvas-sidebar-section-collapse"
          aria-label={`${expanded ? "Collapse" : "Expand"} ${title}`}
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => setExpanded(!expanded)}
        >
          <ChevronDown aria-hidden="true" className={expanded ? "" : "collapsed"} />
        </button>
        <button
          type="button"
          className="canvas-sidebar-section-title"
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => setExpanded(!expanded)}
        >
          {title}
        </button>
        <div className="canvas-sidebar-section-actions">{actions}</div>
      </div>
      {expanded && (
        <div id={contentId} className="canvas-sidebar-section-content">
          {children}
        </div>
      )}
    </section>
  );
}
