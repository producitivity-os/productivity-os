import * as React from "react";
import { Bell, Home, Menu, Plus, X } from "lucide-react";
import Draggable from "react-draggable";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "./ui/context-menu";
import { platformShortcut } from "./application-context-menu";
import { Button } from "./ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "./ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { cn } from "../lib/utils";

type AppHeaderTab = {
  id: string;
  label: string;
  icon?: React.ReactNode;
};

type AppHeaderTabBarProps = {
  tabs: AppHeaderTab[];
  activeTabId?: string;
  onTabSelect: (id: string) => void;
  onTabClose?: (id: string) => void;
  onTabCloseOthers?: (id: string) => void;
  onTabCloseToRight?: (id: string) => void;
  onTabContextMenu?: (
    id: string,
    event: React.MouseEvent<HTMLButtonElement>,
  ) => void;
  onTabsReorder?: (nextTabs: AppHeaderTab[]) => void;
  addTab?: { label: string; onAdd: () => void };
  className?: string;
};

function AppHeaderTabBar({
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  onTabCloseOthers,
  onTabCloseToRight,
  onTabContextMenu,
  onTabsReorder,
  addTab,
  className,
}: AppHeaderTabBarProps) {
  const [draggingTabId, setDraggingTabId] = React.useState<string | null>(null);
  const navRef = React.useRef<HTMLElement>(null);
  const previousRectsRef = React.useRef<Map<string, DOMRect> | null>(null);

  const recordRects = React.useCallback(() => {
    previousRectsRef.current = new Map(
      [...(navRef.current?.querySelectorAll<HTMLElement>("[data-item-id]") ?? [])]
        .map((node) => [node.dataset.itemId ?? "", node.getBoundingClientRect()] as const),
    );
  }, []);

  const reorderDuringDrag = React.useCallback((tabId: string, node: HTMLElement) => {
    if (!onTabsReorder) return;
    const sourceIndex = tabs.findIndex((tab) => tab.id === tabId);
    if (sourceIndex < 0) return;
    const center = node.getBoundingClientRect().left + node.getBoundingClientRect().width / 2;
    let targetIndex = sourceIndex;
    if (sourceIndex > 0) {
      const previous = navRef.current?.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(tabs[sourceIndex - 1].id)}"]`);
      if (previous) {
        const bounds = previous.getBoundingClientRect();
        if (center < bounds.left + bounds.width / 2) targetIndex = sourceIndex - 1;
      }
    }
    if (targetIndex === sourceIndex && sourceIndex < tabs.length - 1) {
      const next = navRef.current?.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(tabs[sourceIndex + 1].id)}"]`);
      if (next) {
        const bounds = next.getBoundingClientRect();
        if (center > bounds.left + bounds.width / 2) targetIndex = sourceIndex + 1;
      }
    }
    if (targetIndex === sourceIndex) return;
    recordRects();
    const nextTabs = [...tabs];
    const [movedTab] = nextTabs.splice(sourceIndex, 1);
    nextTabs.splice(targetIndex, 0, movedTab);
    onTabsReorder(nextTabs);
  }, [onTabsReorder, recordRects, tabs]);

  React.useLayoutEffect(() => {
    const previous = previousRectsRef.current;
    if (!previous || !navRef.current) return;
    previousRectsRef.current = null;
    for (const node of navRef.current.querySelectorAll<HTMLElement>("[data-item-id]")) {
      if (node.dataset.itemId === draggingTabId) continue;
      const before = previous.get(node.dataset.itemId ?? "");
      if (!before) continue;
      const after = node.getBoundingClientRect();
      const delta = before.left - after.left;
      if (Math.abs(delta) < 1) continue;
      node.animate(
        [{ transform: `translateX(${delta}px)` }, { transform: "translateX(0)" }],
        { duration: 150, easing: "cubic-bezier(.2,.8,.2,1)" },
      );
    }
  }, [draggingTabId, tabs]);

  return (
    <div
      className={cn(
        "workspace-app-header-tabs flex h-full min-w-0 flex-1 items-stretch",
        className,
      )}
    >
      <nav ref={navRef} className="flex h-full min-w-0 shrink overflow-hidden">
        {tabs.map((tab, tabIndex) => {
          const active = tab.id === activeTabId;
          return (
            <AppHeaderDraggableTab
              key={tab.id}
              enabled={Boolean(onTabsReorder)}
              dragging={draggingTabId === tab.id}
              onDragStart={() => setDraggingTabId(tab.id)}
              onDrag={(node) => reorderDuringDrag(tab.id, node)}
              onDragEnd={() => setDraggingTabId(null)}
            >
              <ContextMenu>
                <ContextMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={tab.label}
                  aria-current={active || undefined}
                  data-item-id={tab.id}
                  data-dragging={draggingTabId === tab.id || undefined}
                  onClick={() => onTabSelect(tab.id)}
                  onContextMenu={(event) => onTabContextMenu?.(tab.id, event)}
                  className={cn(
                    "group relative flex h-full min-w-[110px] max-w-[220px] items-center gap-1.5 px-4",
                    "border-r border-white/[0.06] border-b-2 border-b-transparent",
                    "text-[11px] font-medium tracking-tight text-zinc-500 transition-colors duration-150",
                    "hover:bg-white/[0.04] hover:text-zinc-300",
                    active &&
                      "bg-white/[0.03] text-zinc-100 after:absolute after:right-[9px] after:bottom-0 after:left-[9px] after:h-[3px] after:rounded-t-sm after:bg-sidebar-primary",
                    draggingTabId === tab.id && "opacity-45",
                  )}
                >
                  {tab.icon && (
                    <span className="grid size-3.5 shrink-0 place-items-center text-zinc-400 [&_svg]:size-3.5">
                      {tab.icon}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-left">
                    {tab.label}
                  </span>
                  {onTabClose && (
                    <span
                      role="button"
                      data-no-tab-drag
                      tabIndex={0}
                      aria-label={`Close ${tab.label}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onTabClose(tab.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.stopPropagation();
                          event.preventDefault();
                          onTabClose(tab.id);
                        }
                      }}
                      className={cn(
                        "flex size-3.5 shrink-0 items-center justify-center rounded-[3px] text-zinc-500",
                        "opacity-0 transition hover:bg-white/10 hover:text-zinc-100 group-hover:opacity-100",
                        active && "opacity-100",
                      )}
                    >
                      <X className="size-2.5 stroke-[1.8]" />
                    </span>
                  )}
                </button>
                </ContextMenuTrigger>
                <ContextMenuContent>
                <ContextMenuItem
                  disabled={!onTabClose}
                  onSelect={() => onTabClose?.(tab.id)}
                >
                  Close
                  <ContextMenuShortcut>
                    {platformShortcut("⌘W", "Ctrl+W")}
                  </ContextMenuShortcut>
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  disabled={tabs.length <= 1 || !onTabCloseOthers}
                  onSelect={() => onTabCloseOthers?.(tab.id)}
                >
                  Close others
                </ContextMenuItem>
                <ContextMenuItem
                  disabled={tabIndex === tabs.length - 1 || !onTabCloseToRight}
                  onSelect={() => onTabCloseToRight?.(tab.id)}
                >
                  Close tabs to the right
                </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            </AppHeaderDraggableTab>
          );
        })}

        {addTab && (
          <button
            type="button"
            aria-label={addTab.label}
            onClick={addTab.onAdd}
            className="flex h-full w-7.5 shrink-0 items-center justify-center border-r border-white/[0.06] text-zinc-500 transition-colors duration-150 hover:bg-white/[0.04] hover:text-zinc-200"
          >
            <Plus className="size-3 stroke-[1.6]" />
          </button>
        )}
      </nav>
      <div className="h-full min-w-0 flex-1" data-tauri-drag-region />
    </div>
  );
}

function AppHeaderDraggableTab({
  enabled,
  dragging,
  onDragStart,
  onDrag,
  onDragEnd,
  children,
}: {
  enabled: boolean;
  dragging: boolean;
  onDragStart(): void;
  onDrag(node: HTMLElement): void;
  onDragEnd(): void;
  children: React.ReactElement;
}) {
  const nodeRef = React.useRef<HTMLDivElement>(null);
  const pointerLeftRef = React.useRef<number | null>(null);
  const [x, setX] = React.useState(0);

  React.useLayoutEffect(() => {
    const expectedLeft = pointerLeftRef.current;
    pointerLeftRef.current = null;
    if (!dragging || expectedLeft === null || !nodeRef.current) return;
    const actualLeft = nodeRef.current.getBoundingClientRect().left;
    const adjustment = expectedLeft - actualLeft;
    if (Math.abs(adjustment) >= 1) setX((current) => current + adjustment);
  }, [children, dragging]);

  if (!enabled) return children;
  return (
    <Draggable
      nodeRef={nodeRef as React.RefObject<HTMLElement>}
      axis="x"
      position={{ x, y: 0 }}
      cancel="[data-no-tab-drag]"
      onStart={() => {
        onDragStart();
      }}
      onDrag={(_event, data) => {
        setX(data.x);
        pointerLeftRef.current = data.node.getBoundingClientRect().left;
        onDrag(data.node);
      }}
      onStop={() => {
        setX(0);
        onDragEnd();
      }}
    >
      <div
        ref={nodeRef}
        className="flex h-full shrink-0"
        style={{
          transform: dragging ? `translateX(${x}px)` : undefined,
          zIndex: dragging ? 10 : undefined,
        }}
      >
        {children}
      </div>
    </Draggable>
  );
}

type AppHeaderProps = {
  trafficLightWidth?: number;
  children?: React.ReactNode;
  className?: string;
};

type AppHeaderIconButtonProps = React.ComponentProps<typeof Button> & {
  active?: boolean;
  edge?: "start" | "end";
};

function AppHeaderIconButton({
  active = false,
  edge = "start",
  className,
  ...props
}: AppHeaderIconButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      data-active={active || undefined}
      className={cn(
        "workspace-app-header-button relative h-full w-[42px] flex-none rounded-none border-0 bg-transparent p-0",
        edge === "start"
          ? "border-r border-white/[0.07]"
          : "border-l border-white/[0.07]",
        "text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-100 focus-visible:bg-white/[0.06] focus-visible:text-zinc-100",
        "data-[active]:bg-white/[0.06] data-[active]:text-zinc-100 [&_svg:not([class*='size-'])]:size-3.5 [&_svg]:stroke-[1.8]",
        active &&
          "after:absolute after:right-2 after:bottom-0 after:left-2 after:h-[3px] after:rounded-t-sm after:bg-sidebar-primary",
        className,
      )}
      {...props}
    />
  );
}

function AppHeaderNotificationBadge({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <span className="absolute top-[3px] right-[7px] grid h-[13px] min-w-[13px] place-items-center rounded-full border-2 border-[#2b2b2b] bg-[#f15f55] px-0.5 text-[7px] leading-none font-extrabold text-white">
      {children}
    </span>
  );
}

function AppHeader({
  trafficLightWidth = 92,
  children,
  className,
}: AppHeaderProps) {
  const isTauriRuntime =
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
  return (
    <header
      data-tauri-drag-region
      className={cn(
        "workspace-app-header relative z-[100] flex h-[32px] w-full flex-[0_0_32px] items-stretch overflow-hidden border-b border-border",
        "bg-[#2b2b2b] text-zinc-500 select-none",
        className,
      )}
    >
      {isTauriRuntime && (
        <div
          className="h-full shrink-0 border-r border-white/[0.06]"
          style={{ width: trafficLightWidth }}
          data-tauri-drag-region
        />
      )}
      {children}
    </header>
  );
}

type WorkspaceAppHeaderMenuEntry =
  | {
      id: string;
      type?: "item";
      label: string;
      disabled?: boolean;
      onSelect?: () => void;
    }
  | { id: string; type: "separator" };

type WorkspaceHeaderBreadcrumb = {
  id: string;
  label: string;
  current?: boolean;
  onSelect?: () => void;
};

type WorkspaceAppHeaderProps = Omit<AppHeaderTabBarProps, "className"> & {
  homeLabel: string;
  homeActive?: boolean;
  onHomeSelect: () => void;
  notificationLabel: string;
  notificationCount?: number;
  onNotificationsSelect?: () => void;
  menuLabel: string;
  menuItems: WorkspaceAppHeaderMenuEntry[];
  breadcrumbs?: readonly WorkspaceHeaderBreadcrumb[];
  trafficLightWidth?: number;
  className?: string;
};

type WorkspaceDocumentHeaderProps = {
  icon?: React.ReactNode;
  title: string;
  status?: React.ReactNode;
  statusTone?: "muted" | "error";
  trafficLightWidth?: number;
  className?: string;
};

function WorkspaceDocumentHeader({
  icon,
  title,
  status,
  statusTone = "muted",
  trafficLightWidth,
  className,
}: WorkspaceDocumentHeaderProps) {
  return (
    <AppHeader trafficLightWidth={trafficLightWidth} className={className}>
      <div
        className="flex h-full min-w-0 flex-1 items-center text-zinc-500"
        data-tauri-drag-region
      >
        <span className="h-full min-w-8 flex-1" data-tauri-drag-region />
        <div
          className="flex h-full min-w-0 max-w-[50%] shrink items-center gap-1.5 px-2.5"
          data-tauri-drag-region
        >
          {icon && (
            <span
              className="grid size-3 shrink-0 place-items-center text-zinc-500 [&_svg]:size-3 [&_svg]:stroke-[1.6]"
              data-tauri-drag-region
            >
              {icon}
            </span>
          )}
          <span
            className="min-w-0 truncate text-[10px] leading-none font-medium text-zinc-400"
            data-tauri-drag-region
          >
            {title}
          </span>
          {status && (
            <span
              className={cn(
                "ml-1 flex shrink-0 items-center gap-1 text-[9px] leading-none capitalize [&_svg]:size-2.5 [&_svg]:stroke-[1.6]",
                statusTone === "error" ? "text-red-400" : "text-zinc-600",
              )}
              data-tauri-drag-region
            >
              {status}
            </span>
          )}
        </div>
      </div>
    </AppHeader>
  );
}

function WorkspaceAppHeader({
  homeLabel,
  homeActive = false,
  onHomeSelect,
  notificationLabel,
  notificationCount = 0,
  onNotificationsSelect,
  menuLabel,
  menuItems,
  breadcrumbs,
  trafficLightWidth,
  className,
  ...tabBarProps
}: WorkspaceAppHeaderProps) {
  return (
    <AppHeader trafficLightWidth={trafficLightWidth} className={className}>
      <AppHeaderIconButton
        aria-label={homeLabel}
        active={homeActive}
        onClick={onHomeSelect}
      >
        <Home aria-hidden="true" />
      </AppHeaderIconButton>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumb
          className="flex h-full min-w-0 shrink-0 items-center border-r border-white/[0.06] px-3"
          data-tauri-drag-region
        >
          <BreadcrumbList className="flex-nowrap text-[10px]">
            {breadcrumbs.map((item, index) => (
              <React.Fragment key={item.id}>
                {index > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem className="min-w-0">
                  {item.current || !item.onSelect ? (
                    <BreadcrumbPage className="max-w-44 truncate text-zinc-300">
                      {item.label}
                    </BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <button
                        type="button"
                        className="max-w-36 truncate text-zinc-500 hover:text-zinc-200"
                        onClick={item.onSelect}
                      >
                        {item.label}
                      </button>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </React.Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      )}
      <AppHeaderTabBar {...tabBarProps} />
      <AppHeaderIconButton
        edge="end"
        className="workspace-app-header-notifications"
        aria-label={notificationLabel}
        onClick={onNotificationsSelect}
      >
        <Bell aria-hidden="true" />
        {notificationCount > 0 && (
          <AppHeaderNotificationBadge>
            {notificationCount}
          </AppHeaderNotificationBadge>
        )}
      </AppHeaderIconButton>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<AppHeaderIconButton edge="end" />}
          aria-label={menuLabel}
        >
          <Menu aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={6}>
          {menuItems.map((item) =>
            item.type === "separator" ? (
              <DropdownMenuSeparator key={item.id} />
            ) : (
              <DropdownMenuItem
                key={item.id}
                disabled={item.disabled}
                onClick={item.onSelect}
              >
                {item.label}
              </DropdownMenuItem>
            ),
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </AppHeader>
  );
}

export {
  AppHeader,
  AppHeaderIconButton,
  AppHeaderNotificationBadge,
  AppHeaderTabBar,
  WorkspaceAppHeader,
  WorkspaceDocumentHeader,
};
export type {
  AppHeaderProps,
  AppHeaderIconButtonProps,
  AppHeaderTabBarProps,
  AppHeaderTab,
  WorkspaceAppHeaderMenuEntry,
  WorkspaceHeaderBreadcrumb,
  WorkspaceAppHeaderProps,
  WorkspaceDocumentHeaderProps,
};
