import * as React from "react";
import { Droplets, Utensils } from "lucide-react";
import { Graphics, Text, type Container } from "pixi.js";
import {
  WorkflowNodeButton,
  WorkflowNodeProgressBar,
  type NutritionWaterDay,
  type WorkflowPluginActionResult,
  type WorkflowNodePickerPreviewProps,
  type WorkflowNodePluginPackage,
  type WorkflowPluginNode,
  type WorkflowPluginPropertiesProps,
} from "@productivity-os/workflow-plugin-sdk";
import { healthNodeTheme, healthPalette } from "./theme";
import {
  createWaterData as createWaterDataForDate,
  formatWaterProgress,
  migrateWaterData,
  nextWaterIntake,
  type WaterData,
} from "./water";

const plusIconUrl = new URL(
  "../../../apps/Workflows/src/assets/svg/plus.svg",
  import.meta.url,
).href;
const minusIconUrl = new URL(
  "../../../apps/Workflows/src/assets/svg/minus.svg",
  import.meta.url,
).href;

function previewStyle(
  palette: WorkflowNodePickerPreviewProps["palette"],
): React.CSSProperties {
  return {
    "--workflow-plugin-surface": palette.surface,
    "--workflow-plugin-border": palette.border,
    "--workflow-plugin-foreground": palette.foreground,
    "--workflow-plugin-muted": palette.mutedForeground,
  } as React.CSSProperties;
}

function LogFoodPreview({ palette }: WorkflowNodePickerPreviewProps) {
  return (
    <span
      className="workflow-plugin-node-preview"
      style={previewStyle(palette)}
    >
      <span className="workflow-plugin-preview-check" aria-hidden="true" />
      <span className="workflow-plugin-preview-copy">
        <strong>Sandwich</strong>
        <small>Log Food</small>
      </span>
    </span>
  );
}

function LogWaterPreview({ palette }: WorkflowNodePickerPreviewProps) {
  return (
    <span
      className="workflow-plugin-node-preview"
      style={previewStyle(palette)}
    >
      <span className="workflow-plugin-preview-water-action" aria-hidden="true">
        <img src={minusIconUrl} alt="" />
      </span>
      <span className="workflow-plugin-preview-copy">
        <strong>Log Water</strong>
        <small>0 ml of 2 L</small>
      </span>
      <span className="workflow-plugin-preview-water-action" aria-hidden="true">
        <img src={plusIconUrl} alt="" />
      </span>
    </span>
  );
}

function today(): string {
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

const createWaterData = (): WaterData => createWaterDataForDate(today());

const pendingWaterNodes = new Set<string>();

async function changeWater(
  services: WorkflowPluginPropertiesProps<WaterData>["services"],
  amount: number,
): Promise<NutritionWaterDay> {
  const date = today();
  const shared = await services.nutritionWaterDay(date);
  return services.saveNutritionWater({
    ...shared,
    intakeMilliliters: nextWaterIntake(shared.intakeMilliliters, amount),
  });
}

function WaterProperties({
  node,
  services,
  updateNode,
}: WorkflowPluginPropertiesProps<WaterData>) {
  const data = { ...createWaterData(), ...node.pluginData };
  React.useEffect(() => {
    let cancelled = false;
    void services.nutritionWaterDay(today()).then((shared) => {
      if (!cancelled) updateNode({ pluginData: { ...data, ...shared } });
    });
    return () => {
      cancelled = true;
    };
  }, [node.id, services]);
  return (
    <>
      <label className="canvas-property-control">
        <span>Amount per click (ml)</span>
        <input
          type="number"
          min={1}
          max={2_000}
          step={1}
          value={data.incrementMilliliters}
          onChange={(event) => {
            const incrementMilliliters = Math.max(
              1,
              Math.min(
                2_000,
                Math.round(event.currentTarget.valueAsNumber || 100),
              ),
            );
            updateNode({ pluginData: { ...data, incrementMilliliters } });
          }}
        />
      </label>
      <div className="workflow-plugin-summary">
        <span>Today</span>
        <span>{formatWaterProgress(data)}</span>
      </div>
    </>
  );
}

function renderWater(
  target: Container,
  node: WorkflowPluginNode<WaterData>,
  data: WaterData,
  inverted: boolean,
) {
  const foreground = inverted
    ? healthNodeTheme.invertedForeground
    : healthNodeTheme.foreground;
  const muted = inverted
    ? healthNodeTheme.invertedForeground
    : healthNodeTheme.mutedForeground;
  const title = new Text({
    text: "Log Water",
    style: {
      fill: foreground,
      fontFamily: healthNodeTheme.typography.fontFamily,
      fontSize: healthNodeTheme.typography.titleSize,
      fontWeight: healthNodeTheme.typography.titleWeight,
    },
  });
  title.anchor.set(0.5);
  title.position.set(node.width / 2, node.height / 2 - 10);
  target.addChild(title);
  const detail = new Text({
    text: formatWaterProgress(data),
    style: {
      fill: muted,
      fontFamily: healthNodeTheme.typography.fontFamily,
      fontSize: healthNodeTheme.typography.detailSize,
      fontWeight: healthNodeTheme.typography.detailWeight,
    },
  });
  detail.anchor.set(0.5);
  detail.position.set(node.width / 2, node.height / 2 + 12);
  target.addChild(detail);
}

type FoodData = Record<string, unknown> & {
  mealName: string;
  logEntryId: string | null;
  loggedAt: number | null;
};

const createFoodData = (): FoodData => ({
  mealName: "Sandwich",
  logEntryId: null,
  loggedAt: null,
});
const pendingFoodNodes = new Set<string>();

function FoodProperties({
  node,
  updateNode,
}: WorkflowPluginPropertiesProps<FoodData>) {
  const data = { ...createFoodData(), ...node.pluginData };
  return (
    <>
      <label className="canvas-property-control">
        <span>Meal</span>
        <input
          value={data.mealName}
          disabled={node.completed}
          onChange={(event) =>
            updateNode({
              pluginData: { ...data, mealName: event.currentTarget.value },
            })
          }
        />
      </label>
      <div className="workflow-plugin-summary">
        <span>{node.completed ? `Ate 1 ${data.mealName}` : "Not logged"}</span>
        <span>
          {data.loggedAt
            ? new Intl.DateTimeFormat(undefined, {
                hour: "numeric",
                minute: "2-digit",
              }).format(data.loggedAt)
            : "Today"}
        </span>
      </div>
    </>
  );
}

function renderFood(
  target: Container,
  node: WorkflowPluginNode<FoodData>,
  data: FoodData,
  inverted: boolean,
) {
  const foreground = inverted
    ? healthNodeTheme.invertedForeground
    : healthNodeTheme.foreground;
  const muted = inverted
    ? healthNodeTheme.invertedForeground
    : healthNodeTheme.mutedForeground;
  const heading = new Text({
    text: node.completed ? `Ate 1 ${data.mealName}` : data.mealName,
    style: {
      fill: foreground,
      fontFamily: healthNodeTheme.typography.fontFamily,
      fontSize: healthNodeTheme.typography.titleSize,
      fontWeight: healthNodeTheme.typography.titleWeight,
    },
  });
  heading.position.set(58, node.height / 2 - 17);
  target.addChild(heading);
  const detail = new Text({
    text: data.loggedAt
      ? new Intl.DateTimeFormat(undefined, {
          hour: "numeric",
          minute: "2-digit",
        }).format(data.loggedAt)
      : "Log Food",
    style: {
      fill: muted,
      fontFamily: healthNodeTheme.typography.fontFamily,
      fontSize: healthNodeTheme.typography.detailSize,
      fontWeight: healthNodeTheme.typography.detailWeight,
    },
  });
  detail.position.set(58, node.height / 2 + 8);
  target.addChild(detail);
}

const waterProgress = new WorkflowNodeProgressBar<
  WorkflowPluginNode<WaterData>
>({
  id: "water:progress",
  bounds: (node) => ({ x: 0, y: 0, width: node.width, height: node.height }),
  value: (node) => {
    const data = { ...createWaterData(), ...node.pluginData };
    return data.intakeMilliliters / Math.max(1, data.targetMilliliters);
  },
  theme: healthNodeTheme.waterProgress,
  radius: (bounds) => healthNodeTheme.waterRadius(bounds.height),
  animationDurationMs: 300,
});

const foodProgress = new WorkflowNodeProgressBar<WorkflowPluginNode<FoodData>>({
  id: "food:progress",
  bounds: (node) => ({ x: 0, y: 0, width: node.width, height: node.height }),
  value: (node) => (node.completed ? 1 : 0),
  theme: healthNodeTheme.completionProgress,
  radius: 20,
  animationDurationMs: 300,
});

function waterButton(amount: "increment" | "decrement") {
  return new WorkflowNodeButton<
    WorkflowPluginNode<WaterData>,
    WorkflowPluginPropertiesProps<WaterData>["services"],
    WorkflowPluginActionResult<WaterData>
  >({
    id: `water:${amount}`,
    bounds: (node) => ({
      x: amount === "increment" ? node.width - 48 : 12,
      y: node.height / 2 - 18,
      width: 36,
      height: 36,
    }),
    icon: amount === "increment" ? "plus" : "minus",
    theme: healthNodeTheme.actionButton,
    disabled: (node) =>
      amount === "decrement" && Number(node.pluginData.intakeMilliliters) <= 0,
    async onPress({ node, services }) {
      if (pendingWaterNodes.has(node.id)) return;
      const data = { ...createWaterData(), ...node.pluginData };
      const delta =
        data.incrementMilliliters * (amount === "increment" ? 1 : -1);
      pendingWaterNodes.add(node.id);
      try {
        const next = await changeWater(services, delta);
        return {
          pluginData: { ...data, ...next },
          complete:
            !node.completed && next.intakeMilliliters >= next.targetMilliliters,
        };
      } finally {
        pendingWaterNodes.delete(node.id);
      }
    },
  });
}

const waterDecrementButton = waterButton("decrement");
const waterIncrementButton = waterButton("increment");

const foodButton = new WorkflowNodeButton<
  WorkflowPluginNode<FoodData>,
  WorkflowPluginPropertiesProps<FoodData>["services"],
  WorkflowPluginActionResult<FoodData>
>({
  id: "food:toggle",
  bounds: (node) => ({ x: 12, y: node.height / 2 - 18, width: 36, height: 36 }),
  icon: "check",
  theme: healthNodeTheme.foodButton,
  completed: (node) => node.completed,
  disabled: (node) => node.completed,
  renderIcon(target, state) {
    if (!state.node.completed) return;
    const centerX = state.bounds.x + state.bounds.width / 2;
    const centerY = state.bounds.y + state.bounds.height / 2;
    target.addChild(
      new Graphics()
        .moveTo(centerX - 7, centerY)
        .lineTo(centerX - 2, centerY + 5)
        .lineTo(centerX + 7, centerY - 6)
        .stroke({
          color: healthNodeTheme.foreground,
          width: 2.5,
          cap: "round",
          join: "round",
        }),
    );
  },
  async onPress({ node, workflowId, services }) {
    if (node.completed || pendingFoodNodes.has(node.id)) return;
    const data = { ...createFoodData(), ...node.pluginData };
    const mealName = data.mealName.trim();
    if (!mealName) throw new Error("Enter a meal name before logging food.");
    pendingFoodNodes.add(node.id);
    try {
      const loggedAt = Date.now();
      const saved = await services.saveNutritionFood({
        id: crypto.randomUUID(),
        localDate: today(),
        mealName,
        quantity: 1,
        workflowId,
        nodeId: node.id,
        loggedAt,
      });
      return {
        pluginData: {
          ...data,
          mealName: saved.mealName,
          logEntryId: saved.id,
          loggedAt: saved.loggedAt,
        },
        complete: true,
      };
    } finally {
      pendingFoodNodes.delete(node.id);
    }
  },
});

const plugin: WorkflowNodePluginPackage = {
  manifest: {
    id: "workflows.health-nodes",
    name: "Nutrition Nodes",
    version: "3.0.0",
    description: "Log food and water from a workflow.",
    marketplace: true,
    defaultInstalled: true,
    app: {
      id: "nutrition",
      name: "Nutrition",
      icon: Droplets,
      launchTarget: "nutrition",
      palette: healthPalette,
    },
  },
  nodes: [
    {
      nodeType: "food",
      title: "Log Food",
      description: "Log one meal in Nutrition",
      icon: Utensils,
      schemaVersion: 1,
      defaultSize: { width: 280, height: 72 },
      NodePickerPreview: LogFoodPreview,
      createData: createFoodData,
      migrate: (data) => ({ ...createFoodData(), ...data }),
      PropertiesEditor: FoodProperties,
      buttons: [foodButton],
      progressBars: [foodProgress],
      render(target, rawNode, context) {
        const node = rawNode as WorkflowPluginNode<FoodData>;
        foodProgress.renderContent(
          target,
          node,
          context,
          (content, contentNode, _renderContext, inverted) =>
            renderFood(
              content,
              contentNode,
              { ...createFoodData(), ...contentNode.pluginData },
              inverted,
            ),
        );
        target.addChild(
          new Graphics()
            .roundRect(0, 0, node.width, node.height, 20)
            .stroke({ color: healthNodeTheme.border, width: 1.5 }),
        );
      },
      reset: (data) => ({
        ...createFoodData(),
        mealName:
          typeof data.mealName === "string" && data.mealName.trim()
            ? data.mealName
            : "Sandwich",
      }),
    },
    {
      nodeType: "water",
      title: "Log Water",
      description: "Adjust today’s water using a configurable amount",
      icon: Droplets,
      schemaVersion: 4,
      defaultSize: { width: 280, height: 56 },
      outlineRadius: (node) => healthNodeTheme.waterRadius(node.height),
      NodePickerPreview: LogWaterPreview,
      createData: createWaterData,
      migrate: (data) => migrateWaterData(data, today()),
      migrateNode: (node, fromVersion) => {
        if (fromVersion >= 4 || Math.abs(node.height - 72) > 0.5) return {};
        const height = 56;
        return {
          y: node.y + (node.height - height) / 2,
          height,
        };
      },
      PropertiesEditor: WaterProperties,
      buttons: [waterDecrementButton, waterIncrementButton],
      progressBars: [waterProgress],
      render(target, rawNode, context) {
        const node = rawNode as WorkflowPluginNode<WaterData>;
        waterProgress.renderContent(
          target,
          node,
          context,
          (content, contentNode, _renderContext, inverted) =>
            renderWater(
              content,
              contentNode,
              { ...createWaterData(), ...contentNode.pluginData },
              inverted,
            ),
        );
        target.addChild(
          new Graphics()
            .roundRect(
              0,
              0,
              node.width,
              node.height,
              healthNodeTheme.waterRadius(node.height),
            )
            .stroke({ color: healthNodeTheme.border, width: 1.5 }),
        );
      },
      reset: () => createWaterData(),
    },
  ],
};

export default plugin;
