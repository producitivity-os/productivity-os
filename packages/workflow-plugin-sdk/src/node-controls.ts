import { Container, Graphics } from "pixi.js";
import type { ColorSource } from "pixi.js";

export type WorkflowNodeControlBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type WorkflowNodeControlRenderContext = {
  hoveredRegionId?: string;
  /** Host-level availability, combined with the button's own disabled state. */
  disabled?: boolean;
};

export type WorkflowNodeControlInteractionContext = {
  /** Host-level availability, combined with the button's own disabled state. */
  disabled?: boolean;
};

export type WorkflowNodeButtonIcon =
  | "play"
  | "pause"
  | "record"
  | "check"
  | "reset"
  | "plus"
  | "minus";

export type WorkflowNodeButtonTheme = {
  background: ColorSource;
  backgroundAlpha?: number;
  border: ColorSource;
  borderWidth?: number;
  foreground: ColorSource;
  hoverBackground?: ColorSource;
  hoverBackgroundAlpha?: number;
  hoverBorder?: ColorSource;
  hoverForeground?: ColorSource;
  disabledBackground?: ColorSource;
  disabledBackgroundAlpha?: number;
  disabledBorder?: ColorSource;
  disabledForeground?: ColorSource;
  disabledAlpha?: number;
  completedBackground?: ColorSource;
  completedBackgroundAlpha?: number;
  completedBorder?: ColorSource;
  completedForeground?: ColorSource;
  completedAlpha?: number;
};

export type WorkflowNodeButtonRenderState<TNode> = {
  node: TNode;
  bounds: WorkflowNodeControlBounds;
  hovered: boolean;
  disabled: boolean;
  completed: boolean;
  icon: WorkflowNodeButtonIcon;
  theme: WorkflowNodeButtonTheme;
};

export type WorkflowNodeButtonIconRenderer = (
  target: Container,
  state: WorkflowNodeButtonRenderState<unknown>,
) => boolean;

let defaultIconRenderer: WorkflowNodeButtonIconRenderer | null = null;

/** Lets a host render SDK button icons from its own approved asset library. */
export function setWorkflowNodeButtonIconRenderer(
  renderer: WorkflowNodeButtonIconRenderer | null,
): void {
  defaultIconRenderer = renderer;
}

export type WorkflowNodeButtonPressContext<TNode, TServices> = {
  node: TNode;
  workflowId: string;
  services: TServices;
};

export type WorkflowNodeButtonConfig<TNode, TServices, TResult> = {
  id: string;
  bounds: WorkflowNodeControlBounds | ((node: TNode) => WorkflowNodeControlBounds);
  icon: WorkflowNodeButtonIcon | ((node: TNode) => WorkflowNodeButtonIcon);
  theme: WorkflowNodeButtonTheme | ((node: TNode) => WorkflowNodeButtonTheme);
  cursor?: string;
  disabled?: (node: TNode) => boolean;
  completed?: (node: TNode) => boolean;
  hidden?: (node: TNode) => boolean;
  radius?: number | ((bounds: WorkflowNodeControlBounds) => number);
  iconSize?: number;
  renderIcon?: (
    target: Container,
    state: WorkflowNodeButtonRenderState<TNode>,
  ) => void;
  render?: (
    target: Container,
    state: WorkflowNodeButtonRenderState<TNode>,
  ) => void;
  onPress?: (
    context: WorkflowNodeButtonPressContext<TNode, TServices>,
  ) => TResult | void | Promise<TResult | void>;
};

/**
 * A canvas-native button used inside workflow nodes. It keeps hit testing,
 * hover/disabled presentation, icon rendering, and activation in one place.
 */
export class WorkflowNodeButton<TNode, TServices, TResult = unknown> {
  readonly id: string;
  private readonly config: WorkflowNodeButtonConfig<TNode, TServices, TResult>;

  constructor(config: WorkflowNodeButtonConfig<TNode, TServices, TResult>) {
    this.id = config.id;
    this.config = config;
  }

  interactionRegion(
    node: TNode,
    context: WorkflowNodeControlInteractionContext = {},
  ): {
    id: string;
    bounds: WorkflowNodeControlBounds;
    cursor: string;
  } | null {
    if (this.config.hidden?.(node)) return null;
    const disabled = Boolean(context.disabled) || Boolean(this.config.disabled?.(node));
    return {
      id: this.id,
      bounds: this.bounds(node),
      cursor: disabled ? "default" : (this.config.cursor ?? "pointer"),
    };
  }

  render(
    target: Container,
    node: TNode,
    context: WorkflowNodeControlRenderContext,
  ): void {
    if (this.config.hidden?.(node)) return;
    const bounds = this.bounds(node);
    const disabled = Boolean(context.disabled) || Boolean(this.config.disabled?.(node));
    const completed = this.config.completed?.(node) ?? false;
    const hovered = !disabled && context.hoveredRegionId === this.id;
    const theme = this.theme(node);
    const icon = this.icon(node);
    const radius = typeof this.config.radius === "function"
      ? this.config.radius(bounds)
      : (this.config.radius ?? Math.min(bounds.width, bounds.height) / 2);
    const background = completed
      ? (theme.completedBackground ?? theme.disabledBackground ?? theme.background)
      : disabled
      ? (theme.disabledBackground ?? theme.background)
      : hovered
        ? (theme.hoverBackground ?? theme.background)
        : theme.background;
    const backgroundAlpha = completed
      ? (theme.completedBackgroundAlpha ?? theme.backgroundAlpha ?? 1)
      : disabled
      ? (theme.disabledBackgroundAlpha ?? theme.backgroundAlpha ?? 1)
      : hovered
        ? (theme.hoverBackgroundAlpha ?? theme.backgroundAlpha ?? 1)
        : (theme.backgroundAlpha ?? 1);
    const border = completed
      ? (theme.completedBorder ?? theme.disabledBorder ?? theme.border)
      : disabled
      ? (theme.disabledBorder ?? theme.border)
      : hovered
        ? (theme.hoverBorder ?? theme.border)
        : theme.border;
    const foreground = completed
      ? (theme.completedForeground ?? theme.disabledForeground ?? theme.foreground)
      : disabled
      ? (theme.disabledForeground ?? theme.foreground)
      : hovered
        ? (theme.hoverForeground ?? theme.foreground)
        : theme.foreground;

    const state: WorkflowNodeButtonRenderState<TNode> = {
      node,
      bounds,
      hovered,
      disabled,
      completed,
      icon,
      theme: { ...theme, foreground },
    };
    if (this.config.render) {
      this.config.render(target, state);
      return;
    }
    const button = new Graphics()
      .roundRect(bounds.x, bounds.y, bounds.width, bounds.height, radius)
      .fill({ color: background, alpha: backgroundAlpha })
      .stroke({ color: border, width: theme.borderWidth ?? 1.25 });
    button.alpha = completed
      ? (theme.completedAlpha ?? 1)
      : disabled
        ? (theme.disabledAlpha ?? 0.55)
        : 1;
    target.addChild(button);

    if (this.config.renderIcon) this.config.renderIcon(target, state);
    else if (!defaultIconRenderer?.(
      target,
      state as WorkflowNodeButtonRenderState<unknown>,
    )) this.renderBuiltInIcon(target, state, foreground);
  }

  press(
    node: TNode,
    regionId: string,
    workflowId: string,
    services: TServices,
    context: WorkflowNodeControlInteractionContext = {},
  ): TResult | void | Promise<TResult | void> {
    if (
      regionId !== this.id ||
      this.config.hidden?.(node) ||
      context.disabled ||
      this.config.disabled?.(node)
    ) return;
    return this.config.onPress?.({ node, workflowId, services });
  }

  private bounds(node: TNode): WorkflowNodeControlBounds {
    return typeof this.config.bounds === "function"
      ? this.config.bounds(node)
      : this.config.bounds;
  }

  private icon(node: TNode): WorkflowNodeButtonIcon {
    return typeof this.config.icon === "function"
      ? this.config.icon(node)
      : this.config.icon;
  }

  private theme(node: TNode): WorkflowNodeButtonTheme {
    return typeof this.config.theme === "function"
      ? this.config.theme(node)
      : this.config.theme;
  }

  private renderBuiltInIcon(
    target: Container,
    state: WorkflowNodeButtonRenderState<TNode>,
    color: ColorSource,
  ): void {
    const { bounds, icon } = state;
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    const size = this.config.iconSize ?? Math.min(14, Math.min(bounds.width, bounds.height) * 0.42);
    const half = size / 2;
    const glyph = new Graphics();
    if (icon === "plus" || icon === "minus") {
      glyph.moveTo(centerX - half, centerY).lineTo(centerX + half, centerY);
      if (icon === "plus")
        glyph.moveTo(centerX, centerY - half).lineTo(centerX, centerY + half);
      glyph.stroke({ color, width: 2, cap: "round" });
    } else if (icon === "pause") {
      const barWidth = Math.max(2, size * 0.23);
      glyph
        .roundRect(centerX - half, centerY - half, barWidth, size, 1)
        .roundRect(centerX + half - barWidth, centerY - half, barWidth, size, 1)
        .fill({ color });
    } else if (icon === "check") {
      glyph
        .moveTo(centerX - half, centerY)
        .lineTo(centerX - size * 0.12, centerY + size * 0.35)
        .lineTo(centerX + half, centerY - size * 0.4)
        .stroke({ color, width: 2.4, cap: "round", join: "round" });
    } else if (icon === "reset") {
      glyph
        .arc(centerX, centerY, half, Math.PI * 1.12, Math.PI * 0.12)
        .moveTo(centerX + half * 0.78, centerY - half * 0.7)
        .lineTo(centerX + half * 1.18, centerY - half * 0.82)
        .lineTo(centerX + half * 1.04, centerY - half * 0.38)
        .stroke({ color, width: 2, cap: "round", join: "round" });
    } else if (icon !== "record") {
      glyph
        .moveTo(centerX - size * 0.3, centerY - half)
        .lineTo(centerX + half, centerY)
        .lineTo(centerX - size * 0.3, centerY + half)
        .closePath()
        .fill({ color });
    }
    glyph.alpha = state.completed
      ? (state.theme.completedAlpha ?? 1)
      : state.disabled
        ? (state.theme.disabledAlpha ?? 0.55)
        : 1;
    target.addChild(glyph);
  }
}

export type WorkflowNodeWaveformTheme = {
  background: ColorSource;
  backgroundAlpha?: number;
  border?: ColorSource;
  borderAlpha?: number;
  borderWidth?: number;
  wave: ColorSource;
  waveAlpha?: number;
  playedWave?: ColorSource;
  playedWaveAlpha?: number;
  playhead?: ColorSource;
  playheadAlpha?: number;
  emptyWave?: ColorSource;
  emptyWaveAlpha?: number;
  disabledAlpha?: number;
};

export type WorkflowNodeWaveformConfig<TNode> = {
  id: string;
  bounds: WorkflowNodeControlBounds | ((node: TNode) => WorkflowNodeControlBounds);
  peaks: (node: TNode) => readonly number[];
  progress?: (node: TNode) => number;
  theme: WorkflowNodeWaveformTheme | ((node: TNode) => WorkflowNodeWaveformTheme);
  disabled?: (node: TNode) => boolean;
  radius?: number | ((bounds: WorkflowNodeControlBounds) => number);
  barWidth?: number;
  barGap?: number;
  minimumAmplitude?: number;
};

export function normalizeWorkflowNodeWaveformPeak(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, Math.abs(value)));
}

/** A compact, rounded waveform surface for interactive workflow-node audio. */
export class WorkflowNodeWaveform<TNode> {
  readonly id: string;
  private readonly config: WorkflowNodeWaveformConfig<TNode>;

  constructor(config: WorkflowNodeWaveformConfig<TNode>) {
    this.id = config.id;
    this.config = config;
  }

  interactionRegion(
    node: TNode,
    context: WorkflowNodeControlInteractionContext = {},
  ): { id: string; bounds: WorkflowNodeControlBounds; cursor: string } {
    return {
      id: this.id,
      bounds: this.bounds(node),
      cursor: context.disabled || this.config.disabled?.(node) ? "default" : "ew-resize",
    };
  }

  position(node: TNode, localX: number): number {
    const bounds = this.bounds(node);
    if (bounds.width <= 0) return 0;
    return clampWorkflowNodeProgress((localX - bounds.x) / bounds.width);
  }

  render(
    target: Container,
    node: TNode,
    context: WorkflowNodeControlRenderContext = {},
  ): void {
    const firstChildIndex = target.children.length;
    const bounds = this.bounds(node);
    const theme = this.theme(node);
    const radius = typeof this.config.radius === "function"
      ? this.config.radius(bounds)
      : (this.config.radius ?? bounds.height / 2);
    const progress = clampWorkflowNodeProgress(this.config.progress?.(node) ?? 0);
    const peaks = this.config.peaks(node).map(normalizeWorkflowNodeWaveformPeak);
    const barWidth = Math.max(1, this.config.barWidth ?? 2);
    const barGap = Math.max(0, this.config.barGap ?? 1.5);
    const count = Math.max(1, Math.floor((bounds.width - barGap) / (barWidth + barGap)));
    const minimumAmplitude = Math.max(0, Math.min(1, this.config.minimumAmplitude ?? 0.12));

    const background = new Graphics()
      .roundRect(bounds.x, bounds.y, bounds.width, bounds.height, radius)
      .fill({ color: theme.background, alpha: theme.backgroundAlpha ?? 1 });
    if (theme.border !== undefined)
      background.stroke({
        color: theme.border,
        alpha: theme.borderAlpha ?? 1,
        width: theme.borderWidth ?? 1,
      });
    target.addChild(background);

    const bars = new Graphics();
    const playedBars = new Graphics();
    const inset = Math.max(2, bounds.height * 0.16);
    const availableHeight = Math.max(1, bounds.height - inset * 2);
    for (let index = 0; index < count; index++) {
      const sourceIndex = peaks.length > 0
        ? Math.min(peaks.length - 1, Math.floor(index / count * peaks.length))
        : -1;
      const amplitude = sourceIndex >= 0 ? Math.max(minimumAmplitude, peaks[sourceIndex]) : minimumAmplitude;
      const height = Math.max(1, availableHeight * amplitude);
      const x = bounds.x + barGap + index * (barWidth + barGap);
      const y = bounds.y + (bounds.height - height) / 2;
      const played = (index + 0.5) / count <= progress;
      (played ? playedBars : bars).roundRect(x, y, barWidth, height, barWidth / 2);
    }
    bars.fill({
      color: peaks.length > 0 ? theme.wave : (theme.emptyWave ?? theme.wave),
      alpha: peaks.length > 0 ? (theme.waveAlpha ?? 1) : (theme.emptyWaveAlpha ?? 0.45),
    });
    playedBars.fill({
      color: theme.playedWave ?? theme.wave,
      alpha: theme.playedWaveAlpha ?? theme.waveAlpha ?? 1,
    });
    const clip = new Graphics()
      .roundRect(bounds.x, bounds.y, bounds.width, bounds.height, radius)
      .fill({ color: theme.background });
    bars.mask = clip;
    playedBars.mask = clip;
    target.addChild(bars, playedBars, clip);

    if (progress > 0 && theme.playhead !== undefined) {
      const x = bounds.x + bounds.width * progress;
      target.addChild(
        new Graphics()
          .roundRect(x - 0.75, bounds.y + 2, 1.5, Math.max(1, bounds.height - 4), 0.75)
          .fill({ color: theme.playhead, alpha: theme.playheadAlpha ?? 1 }),
      );
    }
    if (context.disabled || this.config.disabled?.(node)) {
      const alpha = theme.disabledAlpha ?? 0.5;
      for (let index = firstChildIndex; index < target.children.length; index += 1) {
        const child = target.children[index];
        if (child !== clip) child.alpha *= alpha;
      }
    }
  }

  /** Present for lifecycle symmetry; the waveform currently retains no render state. */
  dispose(): void {}

  private bounds(node: TNode): WorkflowNodeControlBounds {
    return typeof this.config.bounds === "function" ? this.config.bounds(node) : this.config.bounds;
  }

  private theme(node: TNode): WorkflowNodeWaveformTheme {
    return typeof this.config.theme === "function" ? this.config.theme(node) : this.config.theme;
  }
}

export type WorkflowNodeProgressTheme = {
  track: ColorSource;
  trackAlpha?: number;
  fill: ColorSource;
  fillAlpha?: number;
  invertedForeground?: ColorSource;
  mask?: ColorSource;
};

export type WorkflowNodeProgressConfig<TNode> = {
  id: string;
  bounds: WorkflowNodeControlBounds | ((node: TNode) => WorkflowNodeControlBounds);
  value: (node: TNode, now: number) => number;
  theme: WorkflowNodeProgressTheme | ((node: TNode) => WorkflowNodeProgressTheme);
  radius?: number | ((bounds: WorkflowNodeControlBounds) => number);
  animationDurationMs?: number;
};

export type WorkflowNodeProgressContentRenderer<TNode, TContext> = (
  target: Container,
  node: TNode,
  context: TContext,
  inverted: boolean,
) => void;

type ProgressAnimation = {
  displayed: number;
  from: number;
  target: number;
  startedAt: number;
};

export function clampWorkflowNodeProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/** A rounded, animated progress surface for canvas workflow nodes. */
export class WorkflowNodeProgressBar<TNode extends { id: string }> {
  readonly id: string;
  private readonly config: WorkflowNodeProgressConfig<TNode>;
  private readonly animations = new Map<string, ProgressAnimation>();

  constructor(config: WorkflowNodeProgressConfig<TNode>) {
    this.id = config.id;
    this.config = config;
  }

  render(target: Container, node: TNode, now = Date.now()): number {
    const bounds = this.bounds(node);
    const theme = this.theme(node);
    const radius = typeof this.config.radius === "function"
      ? this.config.radius(bounds)
      : (this.config.radius ?? Math.min(bounds.width, bounds.height) / 2);
    const targetValue = clampWorkflowNodeProgress(this.config.value(node, now));
    const value = this.beginAnimation(node.id, targetValue, now);

    target.addChild(
      new Graphics()
        .roundRect(bounds.x, bounds.y, bounds.width, bounds.height, radius)
        .fill({ color: theme.track, alpha: theme.trackAlpha ?? 1 }),
    );
    if (targetValue <= 0 && value <= 0) return 0;

    const fill = new Graphics()
      .roundRect(bounds.x, bounds.y, bounds.width, bounds.height, radius)
      .fill({ color: theme.fill, alpha: theme.fillAlpha ?? 1 });
    const clip = new Graphics();
    fill.mask = clip;
    target.addChild(fill, clip);
    this.paintClip(clip, bounds, value, theme.mask ?? theme.fill);
    this.animateClip(node.id, clip, bounds, theme.mask ?? theme.fill);
    return value;
  }

  renderContent<TContext>(
    target: Container,
    node: TNode,
    context: TContext,
    renderer: WorkflowNodeProgressContentRenderer<TNode, TContext>,
    now = Date.now(),
  ): void {
    renderer(target, node, context, false);
    const theme = this.theme(node);
    if (theme.invertedForeground === undefined) return;
    const bounds = this.bounds(node);
    const targetValue = clampWorkflowNodeProgress(this.config.value(node, now));
    const value = this.beginAnimation(node.id, targetValue, now);
    if (targetValue <= 0 && value <= 0) return;
    const inverted = new Container();
    renderer(inverted, node, context, true);
    const clip = new Graphics();
    inverted.mask = clip;
    target.addChild(inverted, clip);
    this.paintClip(clip, bounds, value, theme.mask ?? theme.fill);
    this.animateClip(node.id, clip, bounds, theme.mask ?? theme.fill);
  }

  value(node: TNode, now = Date.now()): number {
    return clampWorkflowNodeProgress(this.config.value(node, now));
  }

  dispose(nodeId?: string): void {
    if (nodeId) this.animations.delete(nodeId);
    else this.animations.clear();
  }

  private beginAnimation(nodeId: string, target: number, now: number): number {
    const duration = Math.max(0, this.config.animationDurationMs ?? 300);
    const existing = this.animations.get(nodeId);
    if (!existing) {
      this.animations.set(nodeId, { displayed: target, from: target, target, startedAt: now });
      return target;
    }
    this.advance(existing, now, duration);
    if (existing.target !== target) {
      existing.from = existing.displayed;
      existing.target = target;
      existing.startedAt = now;
    }
    return existing.displayed;
  }

  private animateClip(
    nodeId: string,
    clip: Graphics,
    bounds: WorkflowNodeControlBounds,
    mask: ColorSource,
  ): void {
    const duration = Math.max(0, this.config.animationDurationMs ?? 300);
    const animation = this.animations.get(nodeId);
    if (!animation || duration === 0 || animation.displayed === animation.target) {
      if (animation) animation.displayed = animation.target;
      this.paintClip(clip, bounds, animation?.target ?? 0, mask);
      return;
    }
    if (typeof requestAnimationFrame !== "function") {
      animation.displayed = animation.target;
      this.paintClip(clip, bounds, animation.target, mask);
      return;
    }
    const frame = () => {
      if (clip.destroyed) return;
      const current = this.animations.get(nodeId);
      if (!current) return;
      this.advance(current, Date.now(), duration);
      this.paintClip(clip, bounds, current.displayed, mask);
      if (current.displayed !== current.target) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  private advance(animation: ProgressAnimation, now: number, duration: number): void {
    if (duration === 0) {
      animation.displayed = animation.target;
      return;
    }
    const elapsed = Math.max(0, now - animation.startedAt);
    const position = Math.min(1, elapsed / duration);
    const eased = 1 - Math.pow(1 - position, 3);
    animation.displayed = animation.from + (animation.target - animation.from) * eased;
    if (position >= 1) animation.displayed = animation.target;
  }

  private paintClip(
    clip: Graphics,
    bounds: WorkflowNodeControlBounds,
    value: number,
    mask: ColorSource,
  ): void {
    clip
      .clear()
      .rect(bounds.x, bounds.y, bounds.width * clampWorkflowNodeProgress(value), bounds.height)
      .fill({ color: mask });
  }

  private bounds(node: TNode): WorkflowNodeControlBounds {
    return typeof this.config.bounds === "function"
      ? this.config.bounds(node)
      : this.config.bounds;
  }

  private theme(node: TNode): WorkflowNodeProgressTheme {
    return typeof this.config.theme === "function"
      ? this.config.theme(node)
      : this.config.theme;
  }
}
