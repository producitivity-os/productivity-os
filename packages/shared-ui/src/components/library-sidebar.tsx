import * as React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarInput, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider } from "./ui/sidebar";

export type SidebarItem = { id: string; label: string; icon?: Node; active?: boolean; onSelect: () => void };
export type LibrarySidebarOptions = {
  appName: string;
  appIcon: Node;
  searchLabel: string;
  searchIcon: Node;
  onSearch: (query: string) => void;
  items: SidebarItem[];
};

function iconMarkup(node: Node) {
  return node instanceof Element ? node.outerHTML : "";
}

function LibrarySidebarView({ options }: { options: LibrarySidebarOptions }) {
  return (
    <SidebarProvider defaultOpen className="h-full min-h-0">
    <Sidebar collapsible="none" className="ps-library-sidebar !static !flex h-full w-60 border-r">
      <SidebarHeader className="gap-3 p-4">
        <div className="flex items-center gap-2 px-1">
          <span className="grid size-8 place-items-center overflow-hidden rounded-lg bg-primary text-primary-foreground" aria-hidden="true" dangerouslySetInnerHTML={{ __html: iconMarkup(options.appIcon) }} />
          <strong className="text-sm">{options.appName}</strong>
        </div>
        <label className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-2 grid place-items-center" aria-hidden="true" dangerouslySetInnerHTML={{ __html: iconMarkup(options.searchIcon) }} />
          <SidebarInput type="search" className="pl-8" placeholder="Search" aria-label={options.searchLabel} onChange={(event) => options.onSearch(event.currentTarget.value.trim().toLocaleLowerCase())} />
        </label>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {options.items.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton isActive={item.active} onClick={item.onSelect}>
                    {item.icon ? <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: iconMarkup(item.icon) }} /> : null}
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
    </SidebarProvider>
  );
}

/** shadcn Sidebar composition used by library-style application screens. */
export function createLibrarySidebar(options: LibrarySidebarOptions): HTMLElement {
  const host = document.createElement("aside");
  const root = createRoot(host);
  flushSync(() => root.render(<LibrarySidebarView options={options} />));
  return host;
}

export { LibrarySidebarView as LibrarySidebar };
