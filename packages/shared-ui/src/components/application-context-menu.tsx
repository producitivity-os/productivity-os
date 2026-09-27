import * as React from "react";
import {
  Check,
  Clipboard,
  Copy,
  Redo2,
  RefreshCw,
  Scissors,
  Undo2,
} from "lucide-react";

import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "./ui/context-menu";

type ApplicationContextMenuItem = {
  id: string;
  type?: "item";
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  disabled?: boolean;
  variant?: "default" | "destructive";
  onSelect?: () => void | Promise<void>;
};

type ApplicationContextMenuEntry =
  | ApplicationContextMenuItem
  | { id: string; type: "separator" }
  | { id: string; type: "label"; label: string }
  | {
      id: string;
      type: "checkbox";
      label: string;
      checked: boolean;
      shortcut?: string;
      disabled?: boolean;
      onCheckedChange(checked: boolean): void;
    }
  | {
      id: string;
      type: "radio";
      value: string;
      onValueChange(value: string): void;
      items: ReadonlyArray<{
        id: string;
        value: string;
        label: string;
        shortcut?: string;
        disabled?: boolean;
      }>;
    }
  | {
      id: string;
      type: "submenu";
      label: string;
      icon?: React.ReactNode;
      disabled?: boolean;
      items: readonly ApplicationContextMenuEntry[];
    };

type ApplicationContextMenuTarget = {
  element: Element | null;
  editable: HTMLElement | null;
  selectedText: string;
};

type ApplicationContextMenuProps = {
  children: React.ReactElement<React.HTMLAttributes<HTMLElement>>;
  backgroundAction?: "none" | "reload";
  actions?:
    | readonly ApplicationContextMenuEntry[]
    | ((
        target: ApplicationContextMenuTarget,
      ) => readonly ApplicationContextMenuEntry[]);
};

function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return true;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
}

function platformShortcut(mac: string, other: string): string {
  return isApplePlatform() ? mac : other;
}

function editableForTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLElement>(
    "input:not([disabled]), textarea:not([disabled]), [contenteditable='true']",
  );
}

function runEditCommand(command: string): void {
  document.execCommand(command);
}

async function writeClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
  else runEditCommand("copy");
}

async function pasteInto(editable: HTMLElement): Promise<void> {
  if (!navigator.clipboard?.readText) {
    runEditCommand("paste");
    return;
  }
  const text = await navigator.clipboard.readText();
  if (
    editable instanceof HTMLInputElement ||
    editable instanceof HTMLTextAreaElement
  ) {
    const start = editable.selectionStart ?? editable.value.length;
    const end = editable.selectionEnd ?? start;
    editable.setRangeText(text, start, end, "end");
    editable.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertFromPaste",
        data: text,
      }),
    );
    return;
  }
  editable.focus();
  document.execCommand("insertText", false, text);
}

function fallbackActions(
  target: ApplicationContextMenuTarget,
  backgroundAction: "none" | "reload",
): ApplicationContextMenuEntry[] {
  const command = (mac: string, other: string) => platformShortcut(mac, other);
  if (target.editable) {
    const editable = target.editable;
    const readonly =
      (editable instanceof HTMLInputElement ||
        editable instanceof HTMLTextAreaElement) &&
      editable.readOnly;
    return [
      {
        id: "undo",
        label: "Undo",
        icon: <Undo2 />,
        shortcut: command("⌘Z", "Ctrl+Z"),
        onSelect: () => runEditCommand("undo"),
      },
      {
        id: "redo",
        label: "Redo",
        icon: <Redo2 />,
        shortcut: command("⇧⌘Z", "Ctrl+Y"),
        onSelect: () => runEditCommand("redo"),
      },
      { id: "edit-separator", type: "separator" },
      {
        id: "cut",
        label: "Cut",
        icon: <Scissors />,
        shortcut: command("⌘X", "Ctrl+X"),
        disabled: readonly,
        onSelect: () => runEditCommand("cut"),
      },
      {
        id: "copy",
        label: "Copy",
        icon: <Copy />,
        shortcut: command("⌘C", "Ctrl+C"),
        onSelect: () => runEditCommand("copy"),
      },
      {
        id: "paste",
        label: "Paste",
        icon: <Clipboard />,
        shortcut: command("⌘V", "Ctrl+V"),
        disabled: readonly,
        onSelect: () => pasteInto(editable),
      },
      {
        id: "select-all",
        label: "Select All",
        icon: <Check />,
        shortcut: command("⌘A", "Ctrl+A"),
        onSelect: () => runEditCommand("selectAll"),
      },
    ];
  }
  if (target.selectedText) {
    return [
      {
        id: "copy-selection",
        label: "Copy",
        icon: <Copy />,
        shortcut: command("⌘C", "Ctrl+C"),
        onSelect: () => writeClipboard(target.selectedText),
      },
    ];
  }
  return backgroundAction === "reload"
    ? [
        {
          id: "reload",
          label: "Reload",
          icon: <RefreshCw />,
          shortcut: command("⌘R", "Ctrl+R"),
          onSelect: () => window.location.reload(),
        },
      ]
    : [];
}

function renderEntries(
  entries: readonly ApplicationContextMenuEntry[],
): React.ReactNode {
  return entries.map((entry) => {
    if (entry.type === "separator")
      return <ContextMenuSeparator key={entry.id} />;
    if (entry.type === "label")
      return <ContextMenuLabel key={entry.id}>{entry.label}</ContextMenuLabel>;
    if (entry.type === "checkbox") {
      return (
        <ContextMenuCheckboxItem
          key={entry.id}
          checked={entry.checked}
          disabled={entry.disabled}
          onCheckedChange={entry.onCheckedChange}
        >
          {entry.label}
          {entry.shortcut && (
            <ContextMenuShortcut>{entry.shortcut}</ContextMenuShortcut>
          )}
        </ContextMenuCheckboxItem>
      );
    }
    if (entry.type === "radio") {
      return (
        <ContextMenuRadioGroup
          key={entry.id}
          value={entry.value}
          onValueChange={entry.onValueChange}
        >
          {entry.items.map((item) => (
            <ContextMenuRadioItem
              key={item.id}
              value={item.value}
              disabled={item.disabled}
            >
              {item.label}
              {item.shortcut && (
                <ContextMenuShortcut>{item.shortcut}</ContextMenuShortcut>
              )}
            </ContextMenuRadioItem>
          ))}
        </ContextMenuRadioGroup>
      );
    }
    if (entry.type === "submenu") {
      return (
        <ContextMenuSub key={entry.id}>
          <ContextMenuSubTrigger disabled={entry.disabled}>
            {entry.icon}
            {entry.label}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {renderEntries(entry.items)}
          </ContextMenuSubContent>
        </ContextMenuSub>
      );
    }
    return (
      <ContextMenuItem
        key={entry.id}
        disabled={entry.disabled}
        variant={entry.variant}
        onSelect={() => void entry.onSelect?.()}
      >
        {entry.icon}
        {entry.label}
        {entry.shortcut && (
          <ContextMenuShortcut>{entry.shortcut}</ContextMenuShortcut>
        )}
      </ContextMenuItem>
    );
  });
}

function ApplicationContextMenu({
  children,
  actions,
  backgroundAction = "none",
}: ApplicationContextMenuProps) {
  const [target, setTarget] = React.useState<ApplicationContextMenuTarget>({
    element: null,
    editable: null,
    selectedText: "",
  });
  const entriesFor = React.useCallback(
    (next: ApplicationContextMenuTarget) =>
      typeof actions === "function"
        ? actions(next)
        : (actions ?? fallbackActions(next, backgroundAction)),
    [actions, backgroundAction],
  );
  const entries = entriesFor(target);
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {React.cloneElement(children, {
          onContextMenu: (event: React.MouseEvent) => {
            children.props.onContextMenu?.(
              event as React.MouseEvent<HTMLElement>,
            );
            if (event.defaultPrevented) return;
            const nearestTrigger =
              event.target instanceof Element
                ? event.target.closest("[data-slot='context-menu-trigger']")
                : null;
            const editable = editableForTarget(event.target);
            if (
              !editable &&
              nearestTrigger &&
              nearestTrigger !== event.currentTarget
            )
              return;
            const next = {
              element: event.target instanceof Element ? event.target : null,
              editable,
              selectedText: window.getSelection()?.toString().trim() ?? "",
            };
            setTarget(next);
            if (entriesFor(next).length === 0) event.preventDefault();
          },
        })}
      </ContextMenuTrigger>
      {entries.length > 0 && (
        <ContextMenuContent>{renderEntries(entries)}</ContextMenuContent>
      )}
    </ContextMenu>
  );
}

export { ApplicationContextMenu, platformShortcut };
export type {
  ApplicationContextMenuEntry,
  ApplicationContextMenuItem,
  ApplicationContextMenuProps,
  ApplicationContextMenuTarget,
};
