import * as React from "react";
import {
  ExternalLink,
  File,
  FileAudio,
  FileCode2,
  FileStack,
  FileText,
  Film,
  FolderSearch2,
  Image as ImageIcon,
  MoreHorizontal,
  Search,
  Trash2,
  Upload,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from "./ui/attachment";
import { Button } from "./ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "./ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Input } from "./ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { cn } from "../lib/utils";

type WorkspaceMediaKind =
  "image" | "video" | "audio" | "pdf" | "document" | "file";
type WorkspaceMediaState =
  "idle" | "uploading" | "processing" | "error" | "done";

type WorkspaceMediaItem = {
  id: string;
  ownerId: string;
  ownerTitle: string;
  name: string;
  mimeType: string;
  kind: WorkspaceMediaKind;
  sizeBytes: number;
  previewUrl?: string | null;
  contentUrl?: string | null;
  state?: WorkspaceMediaState;
};

type WorkspaceMediaOwner = { id: string; title: string };

type WorkspaceMediaLibraryProps = {
  items: readonly WorkspaceMediaItem[];
  owners: readonly WorkspaceMediaOwner[];
  ownerNoun: string;
  description: string;
  search: string;
  ownerFilter: string;
  kindFilter: "all" | WorkspaceMediaKind;
  importOwnerId: string;
  loading?: boolean;
  importing?: boolean;
  hasMore?: boolean;
  leading?: React.ReactNode;
  className?: string;
  onSearchChange(value: string): void;
  onOwnerFilterChange(value: string): void;
  onKindFilterChange(value: "all" | WorkspaceMediaKind): void;
  onImportOwnerChange(value: string): void;
  onImport(): void | Promise<void>;
  onLoadMore?(): void | Promise<void>;
  onPreview(item: WorkspaceMediaItem): void;
  onOpen(item: WorkspaceMediaItem): void | Promise<void>;
  onReveal(item: WorkspaceMediaItem): void | Promise<void>;
  onDelete(item: WorkspaceMediaItem): void | Promise<void>;
};

const kindOptions: Array<{ value: WorkspaceMediaKind; label: string }> = [
  { value: "image", label: "Images" },
  { value: "video", label: "Videos" },
  { value: "audio", label: "Audio" },
  { value: "pdf", label: "PDFs" },
  { value: "document", label: "Documents" },
  { value: "file", label: "Other files" },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = units[0];
  for (let index = 1; value >= 1024 && index < units.length; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${unit}`;
}

function mediaIcon(kind: WorkspaceMediaKind): React.ReactNode {
  if (kind === "image") return <ImageIcon />;
  if (kind === "video") return <Film />;
  if (kind === "audio") return <FileAudio />;
  if (kind === "pdf") return <FileText />;
  if (kind === "document") return <FileCode2 />;
  return <File />;
}

function MediaAttachment({
  item,
  visual,
  onPreview,
  onOpen,
  onReveal,
  onRequestDelete,
}: {
  item: WorkspaceMediaItem;
  visual: boolean;
  onPreview(): void;
  onOpen(): void;
  onReveal(): void;
  onRequestDelete(): void;
}) {
  const attachment = (
    <Attachment
      orientation={visual ? "vertical" : "horizontal"}
      state={item.state ?? "done"}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Delete" || event.key === "Backspace")
          onRequestDelete();
      }}
      className={cn(
        "hover:border-foreground/20 hover:bg-accent/35",
        visual && "h-full",
      )}
    >
      <AttachmentMedia variant={visual ? "image" : "icon"}>
        {visual && item.previewUrl ? (
          <img src={item.previewUrl} alt="" loading="lazy" />
        ) : (
          mediaIcon(item.kind)
        )}
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle title={item.name}>{item.name}</AttachmentTitle>
        <AttachmentDescription>
          {item.kind.toUpperCase()} · {formatFileSize(item.sizeBytes)} ·{" "}
          {item.ownerTitle}
        </AttachmentDescription>
      </AttachmentContent>
      <AttachmentActions>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <AttachmentAction aria-label={`Actions for ${item.name}`} />
            }
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onPreview}>
              <ImageIcon /> Preview
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpen}>
              <ExternalLink /> Open
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onReveal}>
              <FolderSearch2 /> Reveal in folder
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onRequestDelete}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </AttachmentActions>
      <AttachmentTrigger
        aria-label={`Preview ${item.name}`}
        onClick={onPreview}
      />
    </Attachment>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{attachment}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={onPreview}>
          <ImageIcon /> Preview<ContextMenuShortcut>Space</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={onOpen}>
          <ExternalLink /> Open
        </ContextMenuItem>
        <ContextMenuItem onSelect={onReveal}>
          <FolderSearch2 /> Reveal in folder
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={onRequestDelete}>
          <Trash2 /> Delete<ContextMenuShortcut>⌫</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function WorkspaceMediaLibrary({
  items,
  owners,
  ownerNoun,
  description,
  search,
  ownerFilter,
  kindFilter,
  importOwnerId,
  loading = false,
  importing = false,
  hasMore = false,
  leading,
  className,
  onSearchChange,
  onOwnerFilterChange,
  onKindFilterChange,
  onImportOwnerChange,
  onImport,
  onLoadMore,
  onPreview,
  onOpen,
  onReveal,
  onDelete,
}: WorkspaceMediaLibraryProps) {
  const [deleteItem, setDeleteItem] = React.useState<WorkspaceMediaItem | null>(
    null,
  );
  const visual = items.filter(
    (item) => item.kind === "image" || item.kind === "video",
  );
  const files = items.filter(
    (item) => item.kind !== "image" && item.kind !== "video",
  );
  return (
    <div
      className={cn(
        "workspace-media-library flex min-h-0 flex-1 flex-col",
        className,
      )}
    >
      <header className="flex min-h-14 shrink-0 items-center border-b border-border px-5">
        <div className="flex min-w-0 items-center gap-2">
          {leading}
          <span className="grid min-w-0">
            <small className="text-[10px] text-muted-foreground">
              Workspace
            </small>
            <strong className="truncate text-sm">Media</strong>
          </span>
        </div>
      </header>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
        <label className="relative min-w-44 flex-1 sm:max-w-72">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.currentTarget.value)}
            placeholder="Search media"
            className="pl-8"
          />
        </label>
        <Select
          value={ownerFilter}
          onValueChange={(value) => onOwnerFilterChange(value ?? "all")}
        >
          <SelectTrigger size="sm">
            <SelectValue placeholder={`All ${ownerNoun}s`} />
          </SelectTrigger>
          <SelectContent position="popper" align="end">
            <SelectItem value="all">All {ownerNoun}s</SelectItem>
            {owners.map((owner) => (
              <SelectItem key={owner.id} value={owner.id}>
                {owner.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={kindFilter}
          onValueChange={(value) =>
            onKindFilterChange((value ?? "all") as "all" | WorkspaceMediaKind)
          }
        >
          <SelectTrigger size="sm">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent position="popper" align="end">
            <SelectItem value="all">All types</SelectItem>
            {kindOptions.map((kind) => (
              <SelectItem key={kind.value} value={kind.value}>
                {kind.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={importOwnerId}
          onValueChange={(value) => onImportOwnerChange(value ?? "")}
        >
          <SelectTrigger size="sm">
            <SelectValue placeholder={`Add to ${ownerNoun}`} />
          </SelectTrigger>
          <SelectContent position="popper" align="end">
            {owners.map((owner) => (
              <SelectItem key={owner.id} value={owner.id}>
                Add to {owner.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          disabled={!importOwnerId || importing}
          onClick={() => void onImport()}
        >
          <Upload /> {importing ? "Adding…" : "Add files"}
        </Button>
      </div>
      <section
        className="min-h-0 flex-1 overflow-auto px-5 py-6"
        aria-busy={loading || importing}
      >
        <div className="mb-5 flex items-end justify-between gap-4">
          <span>
            <h1 className="text-lg font-semibold">Media and attachments</h1>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          </span>
          <small className="text-xs text-muted-foreground">
            {items.length} shown
          </small>
        </div>
        {importing && (
          <Attachment state="processing" size="sm" className="mb-4">
            <AttachmentMedia>
              <Upload />
            </AttachmentMedia>
            <AttachmentContent>
              <AttachmentTitle>Adding files…</AttachmentTitle>
              <AttachmentDescription>
                Processing selected attachments
              </AttachmentDescription>
            </AttachmentContent>
          </Attachment>
        )}
        {loading && items.length === 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <Attachment
                key={index}
                state="processing"
                orientation="vertical"
                className="min-h-44 animate-pulse bg-muted/35"
              >
                <AttachmentMedia variant="image" />
                <AttachmentContent>
                  <AttachmentTitle>Loading media…</AttachmentTitle>
                </AttachmentContent>
              </Attachment>
            ))}
          </div>
        ) : items.length ? (
          <>
            {visual.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {visual.map((item) => (
                  <MediaAttachment
                    key={item.id}
                    item={item}
                    visual
                    onPreview={() => onPreview(item)}
                    onOpen={() => void onOpen(item)}
                    onReveal={() => void onReveal(item)}
                    onRequestDelete={() => setDeleteItem(item)}
                  />
                ))}
              </div>
            )}
            {files.length > 0 && (
              <div className={cn("grid gap-2", visual.length > 0 && "mt-5")}>
                {files.map((item) => (
                  <MediaAttachment
                    key={item.id}
                    item={item}
                    visual={false}
                    onPreview={() => onPreview(item)}
                    onOpen={() => void onOpen(item)}
                    onReveal={() => void onReveal(item)}
                    onRequestDelete={() => setDeleteItem(item)}
                  />
                ))}
              </div>
            )}
            {hasMore && onLoadMore && (
              <Button
                variant="outline"
                className="mx-auto mt-5 flex"
                disabled={loading}
                onClick={() => void onLoadMore()}
              >
                Load more
              </Button>
            )}
          </>
        ) : (
          <div className="grid min-h-72 place-items-center rounded-xl border border-dashed border-border text-center">
            <span className="grid justify-items-center gap-2 text-muted-foreground">
              <FileStack className="size-7" />
              <strong className="text-sm text-foreground">
                No media found
              </strong>
              <p className="text-xs">Add files or change your filters.</p>
              <Button
                size="sm"
                disabled={!importOwnerId}
                onClick={() => void onImport()}
              >
                <Upload /> Add files
              </Button>
            </span>
          </div>
        )}
      </section>
      <AlertDialog
        open={Boolean(deleteItem)}
        onOpenChange={(open) => {
          if (!open) setDeleteItem(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this media?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteItem?.name} will be removed from storage. Cards that
              reference it may show a missing-media placeholder.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleteItem) void onDelete(deleteItem);
                setDeleteItem(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export { WorkspaceMediaLibrary, formatFileSize };
export type {
  WorkspaceMediaItem,
  WorkspaceMediaKind,
  WorkspaceMediaLibraryProps,
  WorkspaceMediaOwner,
  WorkspaceMediaState,
};
