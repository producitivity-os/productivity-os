import * as React from "react";
import { createRoot } from "react-dom/client";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "./ui/command";

export type SharedCommand = {
  id: string;
  label: string;
  group?: string;
  shortcut?: string;
  keywords?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  onSelect: () => void;
};

export type CommandPaletteProps = {
  open: boolean;
  onOpenChange(open: boolean): void;
  commands: readonly SharedCommand[];
  title?: string;
  placeholder?: string;
  emptyMessage?: string;
};

export function CommandPalette({
  open,
  onOpenChange,
  commands,
  title = "Command palette",
  placeholder = "Type a command or search…",
  emptyMessage = "No results found.",
}: CommandPaletteProps) {
  const groups = React.useMemo(() => {
    const result = new Map<string, SharedCommand[]>();
    for (const command of commands) {
      const group = command.group ?? "Commands";
      result.set(group, [...(result.get(group) ?? []), command]);
    }
    return result;
  }, [commands]);

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      className="border-0 bg-sidebar text-sidebar-foreground ring-0 shadow-[0_24px_80px_rgba(0,0,0,0.55)] sm:max-w-lg"
    >
      <Command className="bg-sidebar text-sidebar-foreground">
        <CommandInput autoFocus placeholder={placeholder} />
        <CommandList>
          <CommandEmpty>{emptyMessage}</CommandEmpty>
          {[...groups].map(([group, items]) => (
            <CommandGroup heading={group} key={group}>
              {items.map((command) => (
                <CommandItem
                  key={command.id}
                  disabled={command.disabled}
                  value={`${command.label} ${command.keywords ?? ""}`}
                  onSelect={() => {
                    onOpenChange(false);
                    command.onSelect();
                  }}
                >
                  {command.icon}
                  <span>{command.label}</span>
                  {command.shortcut ? <CommandShortcut>{command.shortcut}</CommandShortcut> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

export type CommandPaletteOptions = Omit<CommandPaletteProps, "open" | "onOpenChange">;
export type CommandPaletteElement = HTMLDivElement & { open: () => void; close: () => void };

/** Compatibility helper for non-React hosts. Keyboard shortcuts are owned by the host app. */
export function createCommandPalette(options: CommandPaletteOptions): CommandPaletteElement {
  const host = document.createElement("div") as CommandPaletteElement;
  const root = createRoot(host);
  let open = false;
  const render = () => root.render(
    <CommandPalette
      {...options}
      open={open}
      onOpenChange={(next) => { open = next; render(); }}
    />,
  );
  host.open = () => { open = true; render(); };
  host.close = () => { open = false; render(); };
  render();
  return host;
}
