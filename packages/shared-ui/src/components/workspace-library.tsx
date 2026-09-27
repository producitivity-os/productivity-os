import * as React from "react";
import { ArrowDownAZ, Grid2X2, Plus, Rows3, Star } from "lucide-react";

import { IconGlyph } from "./icon-select";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "./ui/sidebar";

export type WorkspaceLibraryItem = {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  previewUrl?: string | null;
  draft?: boolean;
};

export function WorkspaceLibraryIconButton({
  active = false,
  className,
  ...props
}: React.ComponentProps<typeof Button> & { active?: boolean }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={[active ? "active" : "", className].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

export function WorkspaceLibraryPrimaryButton({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      type="button"
      className={["workspace-library-new-button", className]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}

export function WorkspaceLibraryShell({
  className,
  ...props
}: React.ComponentProps<typeof SidebarProvider>) {
  return (
    <SidebarProvider
      className={["workspace-library-shell", className]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}

export function WorkspaceLibraryMain({
  className,
  ...props
}: React.ComponentProps<typeof SidebarInset>) {
  return (
    <SidebarInset
      className={["workspace-library-main", className]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}

export function WorkspaceLibraryToolbar({
  title,
  compact,
  createLabel,
  itemLabel,
  onSort,
  onCompactChange,
  onCreate,
}: {
  title: string;
  compact: boolean;
  createLabel: string;
  itemLabel: string;
  onSort?(): void;
  onCompactChange(compact: boolean): void;
  onCreate(): void;
}) {
  return (
    <div className="workspace-library-toolbar">
      <div className="workspace-library-toolbar-title">
        <SidebarTrigger className="workspace-mobile-sidebar-trigger" />
        <span>
          <small>Workspace</small>
          <strong>{title}</strong>
        </span>
      </div>
      <div className="workspace-library-toolbar-actions">
        <WorkspaceLibraryIconButton
          aria-label={`Sort ${itemLabel}`}
          onClick={onSort}
        >
          <ArrowDownAZ />
        </WorkspaceLibraryIconButton>
        <WorkspaceLibraryIconButton
          aria-label="Comfortable grid"
          aria-pressed={!compact}
          active={!compact}
          onClick={() => onCompactChange(false)}
        >
          <Grid2X2 />
        </WorkspaceLibraryIconButton>
        <WorkspaceLibraryIconButton
          aria-label="Compact grid"
          aria-pressed={compact}
          active={compact}
          onClick={() => onCompactChange(true)}
        >
          <Rows3 />
        </WorkspaceLibraryIconButton>
        <WorkspaceLibraryPrimaryButton onClick={onCreate}>
          <Plus />
          {createLabel}
        </WorkspaceLibraryPrimaryButton>
      </div>
    </div>
  );
}

export function WorkspaceLibraryHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="workspace-library-section-heading">
      <span>
        <h1>{title}</h1>
        <p>{description}</p>
      </span>
    </div>
  );
}

type WorkspacePreviewCardProps = Omit<
  React.ComponentPropsWithoutRef<"article">,
  "children" | "onRename"
> & {
  item: WorkspaceLibraryItem;
  itemNoun: string;
  starred: boolean;
  renaming: boolean;
  onOpen(): void;
  onStarToggle(): void;
  onRenameCommit(title: string): void;
  onRenameCancel(): void;
};

export const WorkspacePreviewCard = React.forwardRef<
  HTMLElement,
  WorkspacePreviewCardProps
>(function WorkspacePreviewCard(
  {
    item,
    itemNoun,
    starred,
    renaming,
    onOpen,
    onStarToggle,
    onRenameCommit,
    onRenameCancel,
    className,
    onClick,
    onKeyDown,
    ...articleProps
  },
  forwardedRef,
) {
  const [draftTitle, setDraftTitle] = React.useState(item.title);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const renameFocusReadyRef = React.useRef(false);

  React.useEffect(() => setDraftTitle(item.title), [item.title]);
  React.useEffect(() => {
    if (!renaming) {
      renameFocusReadyRef.current = false;
      return;
    }
    renameFocusReadyRef.current = false;
    setDraftTitle(item.title);
    const focusFrame = window.requestAnimationFrame(() => inputRef.current?.select());
    const readyTimer = window.setTimeout(() => {
      renameFocusReadyRef.current = true;
    }, 150);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.clearTimeout(readyTimer);
    };
  }, [item.title, renaming]);

  const commitRename = () => {
    const title = draftTitle.trim();
    if (!title) {
      setDraftTitle(item.title);
      onRenameCancel();
      return;
    }
    onRenameCommit(title);
  };

  return (
    <article
      {...articleProps}
      ref={forwardedRef}
      className={["workspace-preview-card", className]
        .filter(Boolean)
        .join(" ")}
      data-library-item-id={item.id}
      role="link"
      tabIndex={0}
      aria-label={`Open ${item.title}`}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented && !renaming) onOpen();
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        if (event.target !== event.currentTarget || renaming) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="workspace-preview-image-frame">
        {item.previewUrl ? (
          <img src={item.previewUrl} alt={`Preview of ${item.title}`} />
        ) : (
          <div
            className="workspace-preview-placeholder"
            aria-label={`Preview will appear after opening this ${itemNoun}`}
          >
            <span className="workspace-placeholder-card workspace-placeholder-card-one" />
            <span className="workspace-placeholder-card workspace-placeholder-card-two" />
            <span className="workspace-placeholder-line" />
          </div>
        )}
        <button
          type="button"
          className="workspace-preview-star"
          data-starred={starred || undefined}
          aria-label={starred ? `Unstar ${item.title}` : `Star ${item.title}`}
          aria-pressed={starred}
          onClick={(event) => {
            event.stopPropagation();
            onStarToggle();
          }}
        >
          <Star aria-hidden="true" fill={starred ? "currentColor" : "none"} />
        </button>
        {item.draft && <span className="workspace-preview-draft">Draft</span>}
      </div>
      <div className="workspace-preview-meta">
        <span className="workspace-preview-file-icon" aria-hidden="true">
          <IconGlyph name={item.icon} />
        </span>
        <span className="workspace-preview-copy">
          {renaming ? (
            <input
              ref={inputRef}
              className="workspace-preview-title-input"
              value={draftTitle}
              aria-label={`Rename ${item.title}`}
              onChange={(event) => setDraftTitle(event.currentTarget.value)}
              onClick={(event) => event.stopPropagation()}
              onBlur={(event) => {
                const card = event.currentTarget.closest(".workspace-preview-card");
                const nextTarget = event.relatedTarget;
                if (
                  !renameFocusReadyRef.current
                  || nextTarget instanceof Node && card?.contains(nextTarget)
                ) {
                  window.requestAnimationFrame(() => inputRef.current?.select());
                  return;
                }
                commitRename();
              }}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitRename();
                } else if (event.key === "Escape") {
                  setDraftTitle(item.title);
                  onRenameCancel();
                }
              }}
            />
          ) : (
            <strong>{item.title}</strong>
          )}
          <small>{item.subtitle}</small>
        </span>
      </div>
    </article>
  );
});

export function WorkspaceLibrarySkeletonGrid({
  count = 6,
}: {
  count?: number;
}) {
  return (
    <div
      className="workspace-library-card-grid workspace-library-card-grid-loading"
      aria-label="Loading items"
    >
      {Array.from({ length: count }, (_, index) => (
        <div className="workspace-library-card-skeleton" key={index}>
          <Skeleton className="workspace-library-card-skeleton-preview" />
          <div>
            <Skeleton className="workspace-library-card-skeleton-icon" />
            <span>
              <Skeleton className="workspace-library-card-skeleton-title" />
              <Skeleton className="workspace-library-card-skeleton-time" />
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function WorkspaceLibraryEmpty({
  noun,
  searched,
  onClearSearch,
}: {
  noun: string;
  searched: boolean;
  onClearSearch?(): void;
}) {
  return (
    <div className="workspace-library-empty">
      <Grid2X2 />
      <strong>No {noun} found</strong>
      <p>
        {searched
          ? "Try another title or project name."
          : `Create a ${noun.replace(/s$/, "")} to get started.`}
      </p>
      {searched && onClearSearch && (
        <Button type="button" variant="secondary" onClick={onClearSearch}>
          Clear search
        </Button>
      )}
    </div>
  );
}
