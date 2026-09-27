import * as React from "react";
import { createRoot } from "react-dom/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export type SharedToolbarAction = {
  id: string;
  label: string;
  icon: Node;
  shortcut?: string;
  active?: boolean;
  onSelect: () => void;
  submenu?: SharedToolbarAction[];
};

export type SharedToolbarRenderOptions = {
  buttonClass?: string;
  arrowClass?: string;
  groupClass?: string;
};

function iconMarkup(node: Node) {
  return node instanceof Element ? node.outerHTML : "";
}

function ToolbarSubmenu({
  action,
  arrowClass,
}: {
  action: SharedToolbarAction;
  arrowClass: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={(
          <button
            type="button"
            className={arrowClass}
            aria-label={`${action.label} options`}
            title={`${action.label} options`}
          />
        )}
      >
        <span aria-hidden="true">⌄</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="min-w-56">
        {action.submenu?.map((item) => (
          <DropdownMenuItem key={item.id} onSelect={item.onSelect}>
            <span className="flex size-4 shrink-0 items-center justify-center" aria-hidden="true" dangerouslySetInnerHTML={{ __html: iconMarkup(item.icon) }} />
            <span>{item.label}</span>
            {item.shortcut ? <DropdownMenuShortcut>{item.shortcut}</DropdownMenuShortcut> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Renders configurable icon actions, toggle states, and shadcn split-button submenus. */
export function renderToolbarActions(
  toolbar: HTMLElement,
  actions: SharedToolbarAction[],
  options: SharedToolbarRenderOptions = {},
): Map<string, HTMLButtonElement> {
  const buttons = new Map<string, HTMLButtonElement>();
  const buttonClass = options.buttonClass ?? "ps-toolbar-button";
  const arrowClass = options.arrowClass ?? "ps-toolbar-arrow";
  const groupClass = options.groupClass ?? "ps-toolbar-split";

  for (const action of actions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = buttonClass;
    button.title = action.label;
    button.setAttribute("aria-label", action.label);
    button.dataset.tooltip = action.label;
    if (action.shortcut) button.dataset.shortcut = action.shortcut.toLowerCase();
    button.classList.toggle("active", Boolean(action.active));
    button.setAttribute("aria-pressed", String(Boolean(action.active)));
    button.append(action.icon);
    button.onclick = (event) => { event.preventDefault(); action.onSelect(); };
    buttons.set(action.id, button);

    if (action.submenu?.length) {
      const group = document.createElement("div");
      group.className = groupClass;
      const submenuMount = document.createElement("span");
      submenuMount.className = "ps-toolbar-submenu-mount";
      group.append(button, submenuMount);
      toolbar.append(group);
      createRoot(submenuMount).render(<ToolbarSubmenu action={action} arrowClass={arrowClass} />);
    } else {
      toolbar.append(button);
    }
  }
  return buttons;
}
