import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

import { isTauriRuntime } from "@/api/canvas-data";

export type MediaKind =
  "image" | "video" | "audio" | "pdf" | "document" | "file";

export type MediaEntry = {
  id: string;
  canvasId: string;
  canvasTitle: string;
  originalName: string;
  mimeType: string;
  kind: MediaKind;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  hasThumbnail: boolean;
  hasProxy: boolean;
  createdAt: number;
};

export type MediaCursor = { createdAt: number; id: string };
export type MediaListQuery = {
  canvasId?: string | null;
  canvasType?: "workflow" | "notebook" | null;
  query?: string | null;
  kind?: MediaKind | null;
  cursor?: MediaCursor | null;
  limit?: number;
};
export type MediaPage = { items: MediaEntry[]; nextCursor: MediaCursor | null };
export type MediaImportFailure = { name: string; message: string };
export type MediaImportResult = {
  imported: MediaEntry[];
  duplicates: MediaEntry[];
  failures: MediaImportFailure[];
};
export type CanvasMediaSelection = {
  dataUrl: string;
  name: string;
  width: number;
  height: number;
};

const memoryEntries = new Map<string, MediaEntry>();
const memoryFiles = new Map<string, { file: File; url: string }>();

function kindForFile(file: Pick<File, "type" | "name">): MediaKind {
  const mime = file.type.toLocaleLowerCase();
  const extension = file.name.split(".").pop()?.toLocaleLowerCase();
  if (mime.startsWith("image/") || extension === "gif") return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf" || extension === "pdf") return "pdf";
  if (
    mime.startsWith("text/") ||
    ["doc", "docx", "odt", "rtf", "md", "txt"].includes(extension ?? "")
  )
    return "document";
  return "file";
}

function imageDimensions(
  url: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () =>
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () =>
      reject(new Error("The selected image could not be decoded."));
    image.src = url;
  });
}

async function importBrowserFiles(
  canvasId: string,
  canvasTitle: string,
  files: File[],
): Promise<MediaImportResult> {
  const result: MediaImportResult = {
    imported: [],
    duplicates: [],
    failures: [],
  };
  for (const file of files) {
    const duplicate = [...memoryEntries.values()].find(
      (entry) =>
        entry.canvasId === canvasId &&
        entry.originalName === file.name &&
        entry.sizeBytes === file.size,
    );
    if (duplicate) {
      result.duplicates.push(duplicate);
      continue;
    }
    try {
      const id = crypto.randomUUID();
      const url = URL.createObjectURL(file);
      const kind = kindForFile(file);
      const dimensions =
        kind === "image" ? await imageDimensions(url).catch(() => null) : null;
      const entry: MediaEntry = {
        id,
        canvasId,
        canvasTitle,
        originalName: file.name,
        mimeType: file.type || "application/octet-stream",
        kind,
        sizeBytes: file.size,
        width: dimensions?.width ?? null,
        height: dimensions?.height ?? null,
        hasThumbnail: kind === "image",
        hasProxy: false,
        createdAt: Date.now(),
      };
      memoryEntries.set(id, entry);
      memoryFiles.set(id, { file, url });
      result.imported.push(entry);
    } catch (error) {
      result.failures.push({
        name: file.name,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return result;
}

function chooseBrowserFiles(
  imagesOnly: boolean,
  videosOnly = false,
): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = !(imagesOnly || videosOnly);
    if (imagesOnly) input.accept = "image/*,.gif";
    if (videosOnly) input.accept = "video/*,.mov,.mp4,.m4v,.webm";
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.oncancel = () => resolve([]);
    input.click();
  });
}

async function chooseDesktopPaths(
  imagesOnly: boolean,
  videosOnly = false,
): Promise<string[]> {
  const chosen = await openDialog({
    multiple: !(imagesOnly || videosOnly),
    directory: false,
    filters: imagesOnly
      ? [
          {
            name: "Images",
            extensions: [
              "png",
              "jpg",
              "jpeg",
              "webp",
              "gif",
              "bmp",
              "tif",
              "tiff",
              "avif",
            ],
          },
        ]
      : videosOnly
        ? [{ name: "Videos", extensions: ["mov", "mp4", "m4v", "webm"] }]
        : undefined,
  });
  if (!chosen) return [];
  return Array.isArray(chosen) ? chosen : [chosen];
}

export function mediaUrl(
  id: string,
  variant: "content" | "thumbnail" | "proxy" = "content",
): string {
  if (isTauriRuntime)
    return `media://localhost/${encodeURIComponent(id)}/${variant}`;
  return memoryFiles.get(id)?.url ?? "";
}

export const mediaData = {
  async list(query: MediaListQuery = {}): Promise<MediaPage> {
    if (isTauriRuntime) {
      return invoke("list_media", {
        query: { ...query, canvasType: "workflow", limit: query.limit ?? 60 },
      });
    }
    const search = query.query?.trim().toLocaleLowerCase();
    let items = [...memoryEntries.values()]
      .filter(
        (entry) =>
          (!query.canvasId || entry.canvasId === query.canvasId) &&
          (!query.kind || entry.kind === query.kind) &&
          (!search ||
            `${entry.originalName} ${entry.canvasTitle} ${entry.mimeType}`
              .toLocaleLowerCase()
              .includes(search)),
      )
      .sort(
        (left, right) =>
          right.createdAt - left.createdAt || right.id.localeCompare(left.id),
      );
    if (query.cursor) {
      items = items.filter(
        (entry) =>
          entry.createdAt < query.cursor!.createdAt ||
          (entry.createdAt === query.cursor!.createdAt &&
            entry.id < query.cursor!.id),
      );
    }
    const limit = query.limit ?? 60;
    const page = items.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page,
      nextCursor:
        items.length > limit && last
          ? { createdAt: last.createdAt, id: last.id }
          : null,
    };
  },

  async chooseAndImport(
    canvasId: string,
    canvasTitle: string,
    imagesOnly = false,
  ): Promise<MediaImportResult> {
    if (isTauriRuntime) {
      const sourcePaths = await chooseDesktopPaths(imagesOnly);
      if (!sourcePaths.length)
        return { imported: [], duplicates: [], failures: [] };
      return invoke("import_media_paths", { canvasId, sourcePaths });
    }
    return importBrowserFiles(
      canvasId,
      canvasTitle,
      await chooseBrowserFiles(imagesOnly),
    );
  },

  async pickCanvasImage(
    canvasId: string,
    canvasTitle: string,
  ): Promise<CanvasMediaSelection | null> {
    const result = await this.chooseAndImport(canvasId, canvasTitle, true);
    const entry = result.imported[0] ?? result.duplicates[0];
    if (!entry) {
      if (result.failures[0]) throw new Error(result.failures[0].message);
      return null;
    }
    const url = mediaUrl(entry.id);
    const dimensions =
      entry.width && entry.height
        ? { width: entry.width, height: entry.height }
        : await imageDimensions(url);
    return { dataUrl: url, name: entry.originalName, ...dimensions };
  },

  async pickCoverImage(
    canvasId: string,
    canvasTitle: string,
  ): Promise<MediaEntry | null> {
    const result = await this.chooseAndImport(canvasId, canvasTitle, true);
    const entry = result.imported[0] ?? result.duplicates[0];
    if (!entry && result.failures[0])
      throw new Error(result.failures[0].message);
    return entry ?? null;
  },

  async pickCanvasVideo(canvasId: string, canvasTitle: string) {
    const result = isTauriRuntime
      ? await (async () => {
          const sourcePaths = await chooseDesktopPaths(false, true);
          return sourcePaths.length
            ? invoke<MediaImportResult>("import_media_paths", {
                canvasId,
                sourcePaths,
              })
            : { imported: [], duplicates: [], failures: [] };
        })()
      : await importBrowserFiles(
          canvasId,
          canvasTitle,
          await chooseBrowserFiles(false, true),
        );
    const entry = result.imported[0] ?? result.duplicates[0];
    if (!entry) {
      if (result.failures[0]) throw new Error(result.failures[0].message);
      return null;
    }
    const src = mediaUrl(entry.id);
    const previewSrc = entry.hasProxy ? mediaUrl(entry.id, "proxy") : src;
    const dimensions = await new Promise<{ width: number; height: number }>(
      (resolve, reject) => {
        const video = document.createElement("video");
        video.preload = "metadata";
        video.onloadedmetadata = () =>
          resolve({
            width: video.videoWidth || 640,
            height: video.videoHeight || 360,
          });
        video.onerror = () =>
          reject(new Error("The selected video could not be decoded."));
        video.src = previewSrc;
      },
    );
    return {
      src,
      previewSrc,
      mediaId: entry.id,
      name: entry.originalName,
      ...dimensions,
    };
  },

  async delete(id: string): Promise<boolean> {
    if (isTauriRuntime) return invoke("delete_media", { id });
    const stored = memoryFiles.get(id);
    if (stored) URL.revokeObjectURL(stored.url);
    memoryFiles.delete(id);
    return memoryEntries.delete(id);
  },

  async open(id: string): Promise<void> {
    if (isTauriRuntime) return invoke("open_media", { id });
    window.open(mediaUrl(id), "_blank", "noopener,noreferrer");
  },

  async reveal(id: string): Promise<void> {
    if (isTauriRuntime) return invoke("reveal_media", { id });
    window.open(mediaUrl(id), "_blank", "noopener,noreferrer");
  },
};
