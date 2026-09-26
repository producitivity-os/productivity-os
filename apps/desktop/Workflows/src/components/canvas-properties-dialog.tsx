import * as React from "react";
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
import { DEFAULT_ICON_NAME, IconSelect } from "@productivity-os/shared-ui/components/icon-select";
import { toast } from "@productivity-os/shared-ui/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@productivity-os/shared-ui/components/ui/select";

import type { CanvasDocumentSummary } from "@/api/canvas-data";
import { mediaData, mediaUrl } from "@/api/media-data";

export type CanvasProperties = {
  title: string;
  project: string;
  icon: string;
  coverMediaId: string | null;
  canvasType: "workflow";
  workflowKind: "workflow" | "project";
};

type CanvasPropertiesDialogProps = {
  mode: "create" | "edit";
  open: boolean;
  canvas: CanvasDocumentSummary | null;
  folders: string[];
  onOpenChange(open: boolean): void;
  onSave(properties: CanvasProperties): Promise<void>;
};

export function CanvasPropertiesDialog({ mode, open, canvas, folders, onOpenChange, onSave }: CanvasPropertiesDialogProps) {
  const [title, setTitle] = React.useState("");
  const [project, setProject] = React.useState("Drafts");
  const [workflowKind, setWorkflowKind] = React.useState<"workflow" | "project">("workflow");
  const [icon, setIcon] = React.useState<string>(DEFAULT_ICON_NAME);
  const [coverMediaId, setCoverMediaId] = React.useState<string | null>(null);
  const [choosingCover, setChoosingCover] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setTitle(mode === "edit" && canvas ? canvas.title : "");
    setProject(mode === "edit" && canvas ? canvas.project : "Drafts");
    setWorkflowKind(mode === "edit" && canvas ? canvas.workflowKind : "workflow");
    setIcon(mode === "edit" && canvas ? canvas.icon : DEFAULT_ICON_NAME);
    setCoverMediaId(mode === "edit" && canvas ? canvas.coverMediaId : null);
    setChoosingCover(false);
    setSaving(false);
  }, [mode, open, canvas]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle || saving) return;
    setSaving(true);
    try {
      await onSave({
        title: nextTitle,
        project,
        workflowKind,
        icon,
        coverMediaId,
        canvasType: "workflow",
      });
      onOpenChange(false);
    } catch {
      // The caller reports the persistence error and the dialog stays open.
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>{mode === "create" ? "Create workflow" : "Edit workflow properties"}</DialogTitle>
            <DialogDescription>
              {mode === "create"
                ? "Choose a name and folder for your new workflow."
                : "Update how this workflow appears and where it is stored."}
            </DialogDescription>
          </DialogHeader>

          <label className="grid gap-1.5 text-xs text-muted-foreground">
            {mode === "create" ? "Name" : "Title"}
            <Input autoFocus value={title} onChange={(event) => setTitle(event.currentTarget.value)} />
          </label>

          <div className="grid gap-1.5 text-xs text-muted-foreground">
            <span>Type</span>
            <Select value={workflowKind} onValueChange={(value) => setWorkflowKind(value as "workflow" | "project") }>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value="workflow">Workflow</SelectItem>
                <SelectItem value="project">Project</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5 text-xs text-muted-foreground">
            <span>Folder</span>
            <Select value={project} onValueChange={setProject}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {folders.map((folder) => <SelectItem key={folder} value={folder}>{folder}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5 text-xs text-muted-foreground">
            <span>Icon</span>
            <IconSelect value={icon} onValueChange={setIcon} />
          </div>

          {mode === "edit" && canvas && (
            <div className="grid gap-2 text-xs text-muted-foreground">
              <span>Cover image</span>
              {coverMediaId && <img className="canvas-properties-cover" src={mediaUrl(coverMediaId, "thumbnail")} alt="Workflow cover" />}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={choosingCover || saving}
                  onClick={() => {
                    setChoosingCover(true);
                    void mediaData.pickCoverImage(canvas.id, title.trim() || canvas.title)
                      .then((entry) => { if (entry) setCoverMediaId(entry.id); })
                      .catch((error) => toast({ title: "Couldn’t choose cover", description: error instanceof Error ? error.message : String(error) }))
                      .finally(() => setChoosingCover(false));
                  }}
                >{choosingCover ? "Choosing…" : coverMediaId ? "Replace cover" : "Choose cover"}</Button>
                {coverMediaId && <Button type="button" variant="ghost" disabled={saving} onClick={() => setCoverMediaId(null)}>Remove</Button>}
              </div>
            </div>
          )}

          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline" disabled={saving}>Cancel</Button></DialogClose>
            <Button type="submit" disabled={!title.trim() || saving}>
              {saving ? (mode === "create" ? "Creating…" : "Saving…") : (mode === "create" ? "Create workflow" : "Save changes")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
