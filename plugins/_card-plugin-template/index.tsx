import {
  IllustrationCard,
  TextObject,
  type PluginCard,
} from "@productivity-os/canvas";
import { Puzzle } from "lucide-react";
import { z } from "zod";
import { Input } from "@productivity-os/shared-ui/components/ui/input";
import {
  createPluginCard,
  defineCardPlugin,
  type CardPluginEditorProps,
  type CardPluginPropertiesProps,
} from "@notes/plugin-api";

type ExampleData = Record<string, unknown> & { title: string };
const hydrate = (value: unknown): ExampleData => ({
  title:
    value &&
    typeof value === "object" &&
    typeof (value as Record<string, unknown>).title === "string"
      ? String((value as Record<string, unknown>).title)
      : "Untitled",
});

function PropertiesEditor({
  card,
  readOnly,
  updateObject,
}: CardPluginPropertiesProps) {
  const data = hydrate(card.pluginData);
  return (
    <label>
      Title
      <input
        disabled={readOnly}
        value={data.title}
        onChange={(event) =>
          updateObject(card.id, {
            pluginData: { title: event.currentTarget.value },
          } as Partial<PluginCard>)
        }
      />
    </label>
  );
}

function Editor({
  draft,
  onChange,
  fieldErrors,
}: CardPluginEditorProps<ExampleData>) {
  return (
    <label>
      Title
      <Input
        autoFocus
        value={draft.title}
        onChange={(event) => onChange({ title: event.currentTarget.value })}
        aria-invalid={Boolean(fieldErrors.title)}
      />
      {fieldErrors.title?.[0] && <small>{fieldErrors.title[0]}</small>}
    </label>
  );
}

export default defineCardPlugin<ExampleData>({
  manifest: {
    id: "example.card-plugin",
    name: "Card Plugin Template",
    description:
      "Copy this non-marketplace package to start a bundled card plugin.",
    version: "0.1.0",
    author: "Your name",
    marketplace: false,
    card: {
      type: "example",
      schemaVersion: 2,
      defaultDimensions: { width: 320, height: 180 },
    },
  },
  propertiesPanel: "editor",
  create(context) {
    return createPluginCard(this.manifest, context, { title: "Untitled" });
  },
  hydrate,
  serialize: hydrate,
  migrate(data, fromVersion) {
    if (fromVersion < 2)
      return { title: hydrate(data).title.trim() || "Untitled" };
    return hydrate(data);
  },
  slots: {
    ToolbarIcon: Puzzle,
    canvasRender(card) {
      const data = hydrate(card.pluginData);
      return new IllustrationCard({
        ...card,
        kind: "canvas",
        elements: [
          new TextObject({
            id: `${card.id}-title`,
            layerId: card.layerId,
            type: "text",
            x: 24,
            y: 24,
            width: 272,
            height: 80,
            text: data.title,
            fontSize: 24,
            lineHeight: 32,
            color: 0x172033,
            weight: "bold",
          }),
        ],
      });
    },
    hoverLabel: (card) => hydrate(card.pluginData).title,
    Editor: {
      Component: Editor,
      createDraft: hydrate,
      schema: z.object({
        title: z.string().trim().min(1, "Add a title."),
      }) as z.ZodType<ExampleData>,
      commit: hydrate,
    },
    PropertiesEditor,
  },
  lifecycle: {
    onInstall: async () => undefined,
    onUninstall: async () => undefined,
    onCreate: ({ cardId }) => void cardId,
    onActivate: ({ cardId }) => void cardId,
    onDelete: ({ cardId }) => void cardId,
    dispose: () => undefined,
  },
});
