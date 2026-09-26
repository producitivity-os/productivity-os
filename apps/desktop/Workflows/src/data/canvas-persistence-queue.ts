import { canvasData, type SaveCanvasInput } from "@/api/canvas-data";

class CanvasPersistenceQueue {
  private readonly tails = new Map<string, Promise<void>>();

  enqueue(input: SaveCanvasInput): Promise<void> {
    const previous = this.tails.get(input.id) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(async () => {
      await canvasData.save(input);
    });
    this.tails.set(input.id, next);
    const cleanup = () => {
      if (this.tails.get(input.id) === next) this.tails.delete(input.id);
    };
    void next.then(cleanup, cleanup);
    return next;
  }

  async flush(id?: string): Promise<void> {
    if (id) return this.tails.get(id) ?? Promise.resolve();
    await Promise.all(this.tails.values());
  }
}

export const canvasPersistenceQueue = new CanvasPersistenceQueue();
