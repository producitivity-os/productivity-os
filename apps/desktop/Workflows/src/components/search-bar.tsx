import { X } from "lucide-react";
import { Input } from "@productivity-os/shared-ui/components/ui/input";
import { Search } from "lucide-react";

type SearchBarProps = {
  value: string;
  onValueChange(value: string): void;
  label?: string;
  placeholder?: string;
};

export function SearchBar({
  value,
  onValueChange,
  label = "Search workflows",
  placeholder = "Search",
}: SearchBarProps) {
  return (
    <label className="canvas-search-bar">
      <span className="sr-only">{label}</span>
      <Search aria-hidden="true" className="canvas-search-icon" />
      <Input
        type="search"
        value={value}
        onChange={(event) => onValueChange(event.currentTarget.value)}
        aria-label={label}
        placeholder={placeholder}
        className="canvas-search-input"
      />
      {value && (
        <button
          type="button"
          className="canvas-search-clear"
          aria-label="Clear search"
          onClick={() => onValueChange("")}
        >
          <X aria-hidden="true" />
        </button>
      )}
    </label>
  );
}
