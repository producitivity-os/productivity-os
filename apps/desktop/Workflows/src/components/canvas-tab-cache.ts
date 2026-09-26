export type CanvasTabSurface = {
  canvasId: string;
  revision: number;
  key: string;
};

const createSurface = (canvasId: string, revision = 0): CanvasTabSurface => ({
  canvasId,
  revision,
  key: `${canvasId}:${revision}`,
});

export class CanvasTabCache {
  private readonly capacity: number;
  private readonly readyKeys = new Set<string>();
  private surfaces: CanvasTabSurface[] = [];
  private desiredCanvasId = "";
  private displayedKey: string | null = null;

  constructor(capacity = 2) {
    this.capacity = capacity;
  }

  select(canvasId: string): void {
    this.desiredCanvasId = canvasId;
    const existing = this.surfaces.find((candidate) => candidate.canvasId === canvasId) ?? createSurface(canvasId);
    const displayed = this.displayed();
    this.surfaces = [
      existing,
      ...(displayed && displayed.key !== existing.key ? [displayed] : []),
      ...this.surfaces.filter((candidate) => candidate.key !== existing.key && candidate.key !== displayed?.key),
    ].slice(0, this.capacity);
    if (this.readyKeys.has(existing.key)) this.displayedKey = existing.key;
  }

  markReady(key: string): boolean {
    const entry = this.surfaces.find((candidate) => candidate.key === key);
    if (!entry) return false;
    this.readyKeys.add(key);
    if (entry.canvasId !== this.desiredCanvasId) return false;
    this.displayedKey = key;
    return true;
  }

  retry(canvasId: string): void {
    this.surfaces = this.surfaces.map((entry) => {
      if (entry.canvasId !== canvasId) return entry;
      this.readyKeys.delete(entry.key);
      if (this.displayedKey === entry.key) this.displayedKey = null;
      return createSurface(canvasId, entry.revision + 1);
    });
  }

  entries(): readonly CanvasTabSurface[] {
    return this.surfaces;
  }

  target(): CanvasTabSurface | undefined {
    return this.surfaces.find((entry) => entry.canvasId === this.desiredCanvasId);
  }

  displayed(): CanvasTabSurface | undefined {
    return this.surfaces.find((entry) => entry.key === this.displayedKey);
  }

  isLoading(): boolean {
    const target = this.target();
    return !target || !this.readyKeys.has(target.key) || this.displayedKey !== target.key;
  }
}
