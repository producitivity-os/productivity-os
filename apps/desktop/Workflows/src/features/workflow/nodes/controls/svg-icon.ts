import { Assets, Cache, Sprite, Texture, type Container } from "pixi.js";
import type { WorkflowNodeButtonRenderState } from "@productivity-os/workflow-plugin-sdk";

export function renderSvgButtonIcon<TNode>(
  target: Container,
  state: WorkflowNodeButtonRenderState<TNode>,
  sources: Readonly<Partial<Record<typeof state.icon, string>>>,
  size = 14,
): void {
  const source = sources[state.icon];
  if (!source) return;
  const icon = new Sprite(svgTexture(source));
  icon.anchor.set(0.5);
  icon.position.set(
    state.bounds.x + state.bounds.width / 2,
    state.bounds.y + state.bounds.height / 2,
  );
  icon.width = size;
  icon.height = size;
  if (typeof state.theme.foreground === "number") icon.tint = state.theme.foreground;
  icon.alpha = state.disabled ? 0.55 : 1;
  target.addChild(icon);
}

const pending = new Set<string>();
let revision = 0;

export function workflowSvgIconRevision(): number {
  return revision;
}

function svgTexture(source: string): Texture {
  if (Cache.has(source)) return Cache.get<Texture>(source);
  if (typeof window !== "undefined" && !pending.has(source)) {
    pending.add(source);
    void Assets.load<Texture>(source)
      .then(() => {
        revision += 1;
        window.dispatchEvent(new Event("workflow-node-svg-ready"));
      })
      .finally(() => pending.delete(source));
  }
  return Texture.EMPTY;
}
