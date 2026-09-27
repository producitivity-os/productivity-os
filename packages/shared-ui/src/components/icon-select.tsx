import * as React from "react";
import {
  BookOpen,
  FileText,
  FlaskConical,
  LayoutGrid,
  Lightbulb,
  Network,
  Palette,
  Rocket,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

const iconOptions = [
  { value: "file-text", label: "Document", icon: FileText },
  { value: "book-open", label: "Book", icon: BookOpen },
  { value: "lightbulb", label: "Idea", icon: Lightbulb },
  { value: "network", label: "Network", icon: Network },
  { value: "target", label: "Target", icon: Target },
  { value: "rocket", label: "Rocket", icon: Rocket },
  { value: "flask-conical", label: "Research", icon: FlaskConical },
  { value: "palette", label: "Design", icon: Palette },
  { value: "users", label: "Team", icon: Users },
  { value: "layout-grid", label: "Grid", icon: LayoutGrid },
] as const;

const iconsByName = new Map<string, LucideIcon>(iconOptions.map((option) => [option.value, option.icon]));

export const DEFAULT_ICON_NAME = iconOptions[0].value;

export function IconGlyph({ name, ...props }: { name: string } & React.ComponentProps<LucideIcon>) {
  const Icon = iconsByName.get(name) ?? FileText;
  return <Icon aria-hidden="true" {...props} />;
}

export function IconSelect({ value, onValueChange }: { value: string; onValueChange(value: string): void }) {
  const selected = iconOptions.find((option) => option.value === value) ?? iconOptions[0];

  return (
    <Select value={selected.value} onValueChange={onValueChange}>
      <SelectTrigger className="w-full">
        <SelectValue>
          <IconGlyph name={selected.value} />
          <span>{selected.label}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent position="popper">
        {iconOptions.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <IconGlyph name={option.value} />
            <span>{option.label}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
