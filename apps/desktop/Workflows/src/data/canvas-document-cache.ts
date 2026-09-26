import type { CanvasDocument, CanvasSnapshot, SaveCanvasInput } from "@/api/canvas-data";

class CanvasDocumentCache {
  private readonly documents = new Map<string, CanvasDocument>();

  get(id: string): CanvasDocument | null {
    const document = this.documents.get(id);
    return document ? structuredClone(document) : null;
  }

  store(document: CanvasDocument): void {
    this.documents.set(document.id, structuredClone(document));
  }

  update(input: SaveCanvasInput, snapshot: CanvasSnapshot): void {
    const previous = this.documents.get(input.id);
    this.documents.set(input.id, {
      id: input.id,
      title: input.title,
      project: input.project,
      canvasType: input.canvasType,
      workflowKind: input.workflowKind,
      icon: input.icon,
      starred: input.starred,
      coverMediaId: input.coverMediaId,
      canvas: structuredClone(snapshot),
      createdAt: previous?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      revision: previous?.revision ?? 0,
      previewDataUrl: previous?.previewDataUrl ?? null,
    });
  }
}

export const canvasDocumentCache = new CanvasDocumentCache();
