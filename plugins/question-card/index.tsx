import { useLayoutEffect, useRef } from "react";
import {
  IllustrationCard,
  RectangleObject,
  TextObject,
  type PluginCard,
} from "@productivity-os/canvas";
import { CircleHelp } from "lucide-react";
import {
  createPluginCard,
  defineCardPlugin,
  type CardPluginInlineEditorProps,
} from "@notes/plugin-api";

type QuestionRegion = "front" | "back" | "cloze";

type QuestionData = Record<string, unknown> & {
  revisionKind: "basic" | "cloze";
  front: string;
  back: string;
  cloze: string;
  frontHeight: number;
  backHeight: number;
  clozeHeight: number;
};

const CARD_WIDTH = 280;
const SECTION_MIN_HEIGHT = 80;
const CLOZE_MIN_HEIGHT = 160;
const HORIZONTAL_PADDING = 16;
const VERTICAL_PADDING = 12;

const finiteFloor = (value: unknown, minimum: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(minimum, value)
    : minimum;

const normalize = (value: unknown): QuestionData => {
  const data =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return {
    revisionKind: data.revisionKind === "cloze" ? "cloze" : "basic",
    front: typeof data.front === "string" ? data.front : "",
    back: typeof data.back === "string" ? data.back : "",
    cloze: typeof data.cloze === "string" ? data.cloze : "",
    frontHeight: finiteFloor(data.frontHeight, SECTION_MIN_HEIGHT),
    backHeight: finiteFloor(data.backHeight, SECTION_MIN_HEIGHT),
    clozeHeight: finiteFloor(data.clozeHeight, CLOZE_MIN_HEIGHT),
  };
};

const wrappedTextHeight = (
  value: string,
  font: string,
  lineHeight: number,
  minimum: number,
) => {
  if (!value) return minimum;
  if (typeof document === "undefined") return minimum;
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return minimum;
  context.font = font;
  const width = CARD_WIDTH - HORIZONTAL_PADDING * 2;
  let lines = 0;
  for (const sourceLine of value.split("\n")) {
    const words = sourceLine.split(/(\s+)/).filter(Boolean);
    let line = "";
    if (words.length === 0) {
      lines += 1;
      continue;
    }
    for (const word of words) {
      const candidate = line + word;
      if (line && context.measureText(candidate).width > width) {
        lines += 1;
        line = word.trimStart();
      } else {
        line = candidate;
      }
    }
    lines += 1;
  }
  return Math.max(minimum, lines * lineHeight + VERTICAL_PADDING * 2);
};

const regionBounds = (data: QuestionData, regionId: string) => {
  if (data.revisionKind === "cloze") {
    return { x: 0, y: 0, width: CARD_WIDTH, height: data.clozeHeight };
  }
  if (regionId === "back") {
    return {
      x: 0,
      y: data.frontHeight,
      width: CARD_WIDTH,
      height: data.backHeight,
    };
  }
  return { x: 0, y: 0, width: CARD_WIDTH, height: data.frontHeight };
};

function InlineQuestionEditor({
  card: _card,
  data,
  regionId,
  scale,
  onChange,
  onRegionChange,
  onCancel,
}: CardPluginInlineEditorProps<QuestionData>) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const region = (
    data.revisionKind === "cloze" ? "cloze" : regionId
  ) as QuestionRegion;
  const bounds = regionBounds(data, region);
  const value =
    region === "front"
      ? data.front
      : region === "back"
        ? data.back
        : data.cloze;
  const placeholder =
    region === "front"
      ? "Front"
      : region === "back"
        ? "Back"
        : "{{c1::answer}}";
  const fontSize = region === "front" ? 16 : 15;
  const lineHeight = region === "front" ? 20 : 19;

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, [region]);

  const update = (nextValue: string, textarea: HTMLTextAreaElement) => {
    const needed = Math.ceil(textarea.scrollHeight / Math.max(scale, 0.001));
    const next = { ...data };
    if (region === "front") {
      next.front = nextValue;
      next.frontHeight = Math.max(next.frontHeight, SECTION_MIN_HEIGHT, needed);
    } else if (region === "back") {
      next.back = nextValue;
      next.backHeight = Math.max(next.backHeight, SECTION_MIN_HEIGHT, needed);
    } else {
      next.cloze = nextValue;
      next.clozeHeight = Math.max(next.clozeHeight, CLOZE_MIN_HEIGHT, needed);
    }
    onChange(
      next,
      next.revisionKind === "basic"
        ? next.frontHeight + next.backHeight
        : next.clozeHeight,
    );
  };

  return (
    <textarea
      ref={textareaRef}
      aria-label={region === "cloze" ? "Cloze question" : `Question ${region}`}
      value={value}
      placeholder={placeholder}
      spellCheck
      onChange={(event) =>
        update(event.currentTarget.value, event.currentTarget)
      }
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
          return;
        }
        if (event.key !== "Tab" || data.revisionKind !== "basic") return;
        if (
          (region === "front" && !event.shiftKey) ||
          (region === "back" && event.shiftKey)
        ) {
          event.preventDefault();
          onRegionChange(region === "front" ? "back" : "front");
        }
      }}
      style={{
        position: "absolute",
        boxSizing: "border-box",
        left: bounds.x * scale,
        top: bounds.y * scale,
        width: bounds.width * scale,
        height: bounds.height * scale,
        margin: 0,
        padding: `${VERTICAL_PADDING * scale}px ${HORIZONTAL_PADDING * scale}px`,
        border: 0,
        borderRadius: 14 * scale,
        outline: `${Math.max(2, 2 * scale)}px solid #3b82f6`,
        outlineOffset: `${-Math.max(2, 2 * scale)}px`,
        resize: "none",
        overflow: "hidden",
        background: "transparent",
        color: "#172033",
        caretColor: "#2563eb",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif",
        fontSize: fontSize * scale,
        fontWeight: region === "front" ? 600 : 400,
        lineHeight: `${lineHeight * scale}px`,
        pointerEvents: "auto",
      }}
    />
  );
}

const questionCard = defineCardPlugin<QuestionData>({
  manifest: {
    id: "notes.question-card",
    name: "Question Card",
    description: "Basic and cloze questions scheduled by FSRS in Revise.",
    version: "2.0.0",
    author: "Productivity OS",
    marketplace: true,
    defaultInstalled: true,
    card: {
      type: "question",
      schemaVersion: 2,
      defaultDimensions: { width: CARD_WIDTH, height: CLOZE_MIN_HEIGHT },
    },
  },
  propertiesPanel: "hidden",
  create(context) {
    return createPluginCard(this.manifest, context, normalize(null));
  },
  hydrate: normalize,
  serialize: normalize,
  migrate: normalize,
  normalizeCard(card: PluginCard) {
    const before = JSON.stringify([
      card.x,
      card.y,
      card.width,
      card.height,
      card.pluginData,
    ]);
    const center = { x: card.x + card.width / 2, y: card.y + card.height / 2 };
    const data = normalize(card.pluginData);
    data.frontHeight = Math.max(
      data.frontHeight,
      wrappedTextHeight(
        data.front,
        "600 16px system-ui",
        20,
        SECTION_MIN_HEIGHT,
      ),
    );
    data.backHeight = Math.max(
      data.backHeight,
      wrappedTextHeight(
        data.back,
        "400 15px system-ui",
        19,
        SECTION_MIN_HEIGHT,
      ),
    );
    data.clozeHeight = Math.max(
      data.clozeHeight,
      wrappedTextHeight(data.cloze, "400 15px system-ui", 19, CLOZE_MIN_HEIGHT),
    );
    card.width = CARD_WIDTH;
    card.height =
      data.revisionKind === "basic"
        ? data.frontHeight + data.backHeight
        : data.clozeHeight;
    card.x = center.x - card.width / 2;
    card.y = center.y - card.height / 2;
    card.pluginData = data;
    return (
      before !==
      JSON.stringify([card.x, card.y, card.width, card.height, card.pluginData])
    );
  },
  slots: {
    ToolbarIcon: CircleHelp,
    canvasRender(card, context) {
      const data = normalize(card.pluginData);
      const renderRegion = (region: QuestionRegion) => {
        const bounds = regionBounds(data, region);
        const value =
          region === "front"
            ? data.front
            : region === "back"
              ? data.back
              : data.cloze;
        const placeholder =
          region === "front"
            ? "Front"
            : region === "back"
              ? "Back"
              : "{{c1::answer}}";
        const highlighted = context.hoveredRegionId === region;
        return [
          ...(highlighted
            ? [
                new RectangleObject({
                  id: `${card.id}-${region}-hover`,
                  layerId: card.layerId,
                  type: "rect",
                  x: 1,
                  y: bounds.y + 1,
                  width: bounds.width - 2,
                  height: bounds.height - 2,
                  fill: 0xffffff,
                  stroke: context.interactionColor,
                  strokeWidth: 2,
                  cornerRadius: 13,
                }),
              ]
            : []),
          new TextObject({
            id: `${card.id}-${region}-text`,
            layerId: card.layerId,
            type: "text",
            x: HORIZONTAL_PADDING,
            y: bounds.y + VERTICAL_PADDING,
            width: CARD_WIDTH - HORIZONTAL_PADDING * 2,
            height: bounds.height - VERTICAL_PADDING * 2,
            text: value || placeholder,
            fontSize: region === "front" ? 16 : 15,
            lineHeight: region === "front" ? 20 : 19,
            color: value ? 0x172033 : 0x94a3b8,
            weight: region === "front" ? "bold" : "regular",
            sizing: "fixed",
            padding: 0,
          }),
        ];
      };
      const elements =
        data.revisionKind === "basic"
          ? [
              ...renderRegion("front"),
              new RectangleObject({
                id: `${card.id}-divider`,
                layerId: card.layerId,
                type: "rect",
                x: 0,
                y: data.frontHeight - 0.5,
                width: CARD_WIDTH,
                height: 1,
                fill: 0xd1d5db,
                stroke: 0xd1d5db,
                strokeWidth: 0,
              }),
              ...renderRegion("back"),
            ]
          : renderRegion("cloze");
      return new IllustrationCard({ ...card, kind: "canvas", elements });
    },
    InlineEditor: {
      Component: InlineQuestionEditor,
      sizePolicy: "grow-height",
      suppressCardSelection: true,
      initialRegion(card) {
        return normalize(card.pluginData).revisionKind === "cloze"
          ? "cloze"
          : "front";
      },
      regions(card) {
        const data = normalize(card.pluginData);
        return (
          data.revisionKind === "basic" ? ["front", "back"] : ["cloze"]
        ).map((id) => ({
          id,
          bounds: regionBounds(data, id),
          cursor: "text",
          capture: false,
        }));
      },
    },
  },
  lifecycle: {},
});

export default questionCard;
