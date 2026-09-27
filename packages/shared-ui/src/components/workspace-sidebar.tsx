import * as React from "react";
import { Check, ChevronsUpDown, X, Search } from "lucide-react";

import { AppLogo } from "./app-logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from "./ui/sidebar";

export type WorkspaceProfile = {
  id: string;
  name: string;
  detail: string;
};

export type WorkspaceSidebarProps = {
  profiles: readonly WorkspaceProfile[];
  activeProfileId: string;
  onProfileChange(profileId: string): void;
  search: string;
  onSearchChange(value: string): void;
  searchLabel?: string;
  searchPlaceholder?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
};

export type WorkspaceSidebarItemDefinition = {
  id: string;
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
  title?: string;
  onSelect?: () => void;
};

export type WorkspaceSidebarItemProps = WorkspaceSidebarItemDefinition & {
  active?: boolean;
  onSelectItem?: (id: string) => void;
};

export function WorkspaceSidebarItem({
  id,
  label,
  icon,
  active = false,
  disabled = false,
  title,
  onSelect,
  onSelectItem,
}: WorkspaceSidebarItemProps) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        size="sm"
        className="workspace-sidebar-item [&_svg]:size-3.5"
        disabled={disabled}
        title={title}
        onClick={() => {
          onSelect?.();
          onSelectItem?.(id);
        }}
      >
        {icon}
        <span>{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function WorkspaceSidebarItemList({
  items,
  activeItemId,
  loading = false,
  skeletonCount = 3,
  onSelectItem,
}: {
  items: readonly WorkspaceSidebarItemDefinition[];
  activeItemId?: string;
  loading?: boolean;
  skeletonCount?: number;
  onSelectItem?: (id: string) => void;
}) {
  return (
    <SidebarMenu>
      {loading
        ? Array.from({ length: skeletonCount }, (_, index) => (
            <SidebarMenuSkeleton key={index} showIcon />
          ))
        : items.map((item) => (
            <WorkspaceSidebarItem
              key={item.id}
              {...item}
              active={item.id === activeItemId}
              onSelectItem={onSelectItem}
            />
          ))}
    </SidebarMenu>
  );
}

export function WorkspaceSidebarSection({
  label,
  items,
  activeItemId,
  loading = false,
  skeletonCount,
  onSelectItem,
  action,
  emptyText,
  className,
}: {
  label?: string;
  items: readonly WorkspaceSidebarItemDefinition[];
  activeItemId?: string;
  loading?: boolean;
  skeletonCount?: number;
  onSelectItem?: (id: string) => void;
  action?: { label: string; icon: React.ReactNode; onSelect(): void };
  emptyText?: string;
  className?: string;
}) {
  return (
    <SidebarGroup className={className}>
      {label && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
      {action && (
        <SidebarGroupAction
          aria-label={action.label}
          title={action.label}
          onClick={action.onSelect}
        >
          {action.icon}
        </SidebarGroupAction>
      )}
      <SidebarGroupContent>
        <WorkspaceSidebarItemList
          items={items}
          activeItemId={activeItemId}
          loading={loading}
          skeletonCount={skeletonCount}
          onSelectItem={onSelectItem}
        />
        {!loading && items.length === 0 && emptyText && (
          <p className="workspace-side-empty">{emptyText}</p>
        )}
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function WorkspaceSidebarFooterItem({
  label,
  icon,
  active = false,
  disabled = false,
  onSelect,
}: {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onSelect(): void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={[
        "workspace-sidebar-footer-item h-7 text-xs [&_svg]:size-3.5",
        active ? "active" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      disabled={disabled}
      onClick={onSelect}
    >
      {icon}
      <span>{label}</span>
    </Button>
  );
}

export function WorkspaceSidebar({
  profiles,
  activeProfileId,
  onProfileChange,
  search,
  onSearchChange,
  searchLabel = "Search",
  searchPlaceholder = "Search",
  children,
  footer,
  className,
  style,
}: WorkspaceSidebarProps) {
  const activeProfile =
    profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0];
  if (!activeProfile) return null;

  return (
    <Sidebar
      collapsible="offcanvas"
      className={["workspace-library-sidebar", className]
        .filter(Boolean)
        .join(" ")}
      style={style}
    >
      <SidebarHeader className="workspace-side-header">
        <DropdownMenu>
          <DropdownMenuTrigger
            className="workspace-account-switcher"
            aria-label="Switch profile"
          >
            <span className="workspace-account-avatar">
              <AppLogo color="#fff" size={26} label="" />
            </span>
            <span>
              <strong>{activeProfile.name}</strong>
              <small>{activeProfile.detail}</small>
            </span>
            <ChevronsUpDown aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            sideOffset={6}
            className="workspace-profile-menu"
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel>Profiles</DropdownMenuLabel>
              {profiles.map((profile) => (
                <DropdownMenuItem
                  key={profile.id}
                  onClick={() => onProfileChange(profile.id)}
                >
                  <span className="workspace-profile-menu-icon">
                    <AppLogo color="#fff" size={21} label="" />
                  </span>
                  <span className="workspace-profile-menu-copy">
                    <strong>{profile.name}</strong>
                    <small>{profile.detail}</small>
                  </span>
                  {profile.id === activeProfileId && (
                    <Check className="workspace-profile-menu-check" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>Manage profiles</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <label className="workspace-search-bar">
          <span className="sr-only">{searchLabel}</span>
          <Search aria-hidden="true" className="workspace-search-icon" />
          <Input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.currentTarget.value)}
            aria-label={searchLabel}
            placeholder={searchPlaceholder}
            className="workspace-search-input"
          />
          {search && (
            <button
              type="button"
              className="workspace-search-clear"
              aria-label="Clear search"
              onClick={() => onSearchChange("")}
            >
              <X aria-hidden="true" />
            </button>
          )}
        </label>
      </SidebarHeader>

      <SidebarContent>{children}</SidebarContent>
      {footer && (
        <SidebarFooter className="workspace-side-footer">
          {footer}
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
