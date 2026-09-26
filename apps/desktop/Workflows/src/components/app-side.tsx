import * as React from "react";
import {
  Archive,
  Clock3,
  Cog,
  FileClock,
  FolderKanban,
  Folder,
  Image,
  Plus,
  Star,
  Trash2,
  Workflow,
} from "lucide-react";
import { SidebarSeparator } from "@productivity-os/shared-ui/components/ui/sidebar";
import {
  WorkspaceSidebar,
  WorkspaceSidebarFooterItem,
  WorkspaceSidebarSection,
  type WorkspaceSidebarItemDefinition,
} from "@productivity-os/shared-ui/components/workspace-sidebar";
import { Button } from "@productivity-os/shared-ui/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@productivity-os/shared-ui/components/ui/dialog";
import { Input } from "@productivity-os/shared-ui/components/ui/input";
import { toast } from "@productivity-os/shared-ui/hooks/use-toast";

import type { CanvasRecord } from "@/data/canvases";

type AppSideProps = {
  loading?: boolean;
  search: string;
  onSearchChange(value: string): void;
  starredCanvases: CanvasRecord[];
  folders: string[];
  onCreateFolder(name: string): void;
  onOpenCanvas(canvasId: string): void;
  activeItem: string;
  onActiveItemChange(id: string): void;
  onNavigateMedia(): void;
  onNavigateSettings(): void;
};

const libraryItems: WorkspaceSidebarItemDefinition[] = [
  { id: "recents", label: "Recents", icon: <Clock3 /> },
  { id: "drafts", label: "Drafts", icon: <FileClock /> },
  { id: "type:workflow", label: "Workflows", icon: <Workflow /> },
  { id: "type:project", label: "Projects", icon: <FolderKanban /> },
];

const profiles = [
  { id: "personal", name: "Mustafa’s space", detail: "Personal workspace" },
  { id: "product", name: "Product team", detail: "Product workspace" },
  { id: "research", name: "Research team", detail: "Research workspace" },
] as const;

export function AppSide({
  loading = false,
  search,
  onSearchChange,
  starredCanvases,
  folders,
  onCreateFolder,
  onOpenCanvas,
  activeItem,
  onActiveItemChange,
  onNavigateMedia,
  onNavigateSettings,
}: AppSideProps) {
  const [activeProfileId, setActiveProfileId] =
    React.useState<(typeof profiles)[number]["id"]>("personal");
  const [folderDialogOpen, setFolderDialogOpen] = React.useState(false);
  const [folderName, setFolderName] = React.useState("");
  const [folderError, setFolderError] = React.useState("");
  const activeProfile =
    profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0];
  const folderItems: WorkspaceSidebarItemDefinition[] = folders
    .filter((folder) => folder !== "Drafts")
    .map((folder) => ({
      id: `folder:${folder}`,
      label: folder,
      icon: <Folder />,
    }));
  const createFolder = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = folderName.trim();
    if (!name) return;
    if (
      folders.some(
        (folder) => folder.toLocaleLowerCase() === name.toLocaleLowerCase(),
      )
    ) {
      setFolderError("A folder with this name already exists.");
      return;
    }
    onCreateFolder(name);
    onActiveItemChange(`folder:${name}`);
    setFolderDialogOpen(false);
  };
  return (
    <>
      <WorkspaceSidebar
        profiles={profiles}
        activeProfileId={activeProfile.id}
        onProfileChange={(profileId) => {
          const profile = profiles.find(
            (candidate) => candidate.id === profileId,
          );
          if (!profile) return;
          setActiveProfileId(profile.id);
          toast({
            title: `Switched to ${profile.name}`,
            description: profile.detail,
          });
        }}
        search={search}
        onSearchChange={onSearchChange}
        searchLabel="Search workflows"
        footer={
          <WorkspaceSidebarFooterItem
            label="Settings"
            icon={<Cog aria-hidden="true" />}
            active={activeItem === "settings"}
            onSelect={onNavigateSettings}
          />
        }
      >
        <WorkspaceSidebarSection
          items={libraryItems}
          activeItemId={activeItem}
          loading={loading}
          onSelectItem={onActiveItemChange}
        />

        <SidebarSeparator />

        <WorkspaceSidebarSection
          label="Folders"
          items={folderItems}
          activeItemId={activeItem}
          loading={loading}
          onSelectItem={onActiveItemChange}
          className="workspace-folders-group"
          action={{
            label: "Create folder",
            icon: <Plus />,
            onSelect: () => {
              setFolderName("");
              setFolderError("");
              setFolderDialogOpen(true);
            },
          }}
        />

        <WorkspaceSidebarSection
          items={[
            {
              id: "media",
              label: "Media",
              icon: <Image />,
              onSelect: onNavigateMedia,
            },
            {
              id: "archive",
              label: "Archive",
              icon: <Archive />,
              onSelect: () => onActiveItemChange("archive"),
            },
            {
              id: "trash",
              label: "Trash",
              icon: <Trash2 />,
              onSelect: () => onActiveItemChange("trash"),
            },
          ]}
          activeItemId={activeItem}
        />

        <SidebarSeparator />

        <WorkspaceSidebarSection
          label="Starred"
          items={starredCanvases.map((canvas) => ({
            id: `starred:${canvas.id}`,
            label: canvas.title,
            icon: <Star fill="currentColor" />,
            onSelect: () => onOpenCanvas(canvas.id),
          }))}
          loading={loading}
          emptyText="Star a workflow to keep it close."
        />
      </WorkspaceSidebar>

      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent>
          <form className="grid gap-4" onSubmit={createFolder}>
            <DialogHeader>
              <DialogTitle>Create folder</DialogTitle>
              <DialogDescription>
                Add a folder to organize your workflows.
              </DialogDescription>
            </DialogHeader>
            <label className="grid gap-1.5 text-xs text-muted-foreground">
              Folder name
              <Input
                autoFocus
                value={folderName}
                aria-invalid={Boolean(folderError)}
                onChange={(event) => {
                  setFolderName(event.currentTarget.value);
                  setFolderError("");
                }}
              />
              {folderError && (
                <span className="text-destructive">{folderError}</span>
              )}
            </label>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={!folderName.trim()}>
                Create folder
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
