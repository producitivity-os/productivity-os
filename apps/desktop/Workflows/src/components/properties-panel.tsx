import {
  CANVAS_MIXED_VALUE,
  type CanvasPropertiesSlotProps,
  type CanvasPropertyField,
  type CanvasPropertyPatch,
  type ArrowObject,
} from "@productivity-os/canvas";
import type { ReactNode } from "react";
import {
  WorkflowPropertiesPanel,
  type WorkflowDestination,
} from "@/components/workflow-properties-panel";
import { WorkflowNodePropertySelection } from "@/features/workflow/nodes/properties";

const colorValue = (value: unknown): string =>
  typeof value === "number"
    ? `#${value.toString(16).padStart(6, "0")}`
    : "#000000";

const colorNumber = (value: string): number =>
  Number.parseInt(value.slice(1), 16);

type CanvasPropertiesPanelProps = CanvasPropertiesSlotProps & {
  workflowDestinations?: readonly WorkflowDestination[];
  workflowMode?: boolean;
  getWorkflowObjects?: () => readonly import("@productivity-os/canvas").CanvasObject[];
  workflowId?: string;
  installedPluginIds?: ReadonlySet<string>;
  extra?: ReactNode;
};

export function CanvasPropertiesPanel({
  context,
  selection,
  onPatch,
  updateObject,
  updateObjects,
  workflowDestinations = [],
  workflowMode = false,
  getWorkflowObjects,
  workflowId = "",
  installedPluginIds = new Set<string>(),
  extra,
}: CanvasPropertiesPanelProps) {
  if (WorkflowNodePropertySelection.from(selection.selectedObjects)) {
    return (
      <WorkflowPropertiesPanel
        selection={selection}
        updateObject={updateObject}
        updateObjects={updateObjects}
        destinations={workflowDestinations}
        getObjects={getWorkflowObjects ?? (() => selection.selectedObjects)}
        workflowId={workflowId}
        installedPluginIds={installedPluginIds}
      />
    );
  }
  if (workflowMode) {
    const arrows = selection.selectedObjects.filter(
      (object): object is ArrowObject => object.type === "arrow",
    );
    return arrows.length === selection.selectedObjects.length &&
      arrows.length > 0 ? (
      <WorkflowArrowProperties arrows={arrows} updateObject={updateObject} />
    ) : null;
  }
  if (context.fields.length === 0) return null;
  const title =
    context.mode === "selection"
      ? context.selectionCount === 1
        ? "Properties"
        : `${context.selectionCount} selected`
      : `${context.tool === "markdown" ? "Text" : context.tool} defaults`;

  return (
    <aside
      data-canvas-ui="true"
      className="canvas-properties-panel"
      aria-label="Workflow properties"
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <div className="canvas-properties-title">{title}</div>
      <div className="canvas-properties-fields">
        {context.fields.map((field) => (
          <PropertyControl key={field.name} field={field} onPatch={onPatch} />
        ))}
        {extra}
      </div>
    </aside>
  );
}

function WorkflowArrowProperties({
  arrows,
  updateObject,
}: {
  arrows: readonly ArrowObject[];
  updateObject: CanvasPropertiesSlotProps["updateObject"];
}) {
  const common = (read: (arrow: ArrowObject) => string) => {
    const first = read(arrows[0]);
    return arrows.every((arrow) => read(arrow) === first) ? first : undefined;
  };
  const patch = (values: Partial<ArrowObject>) => {
    for (const arrow of arrows) updateObject(arrow.id, values);
  };
  return (
    <aside
      data-canvas-ui="true"
      className="canvas-properties-panel"
      aria-label="Connection properties"
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <div className="canvas-properties-title">
        {arrows.length === 1
          ? "Connection properties"
          : `${arrows.length} connections`}
      </div>
      <div className="canvas-properties-fields">
        <label className="canvas-property-control">
          <span>Name</span>
          <input
            aria-label="Name"
            value={common((arrow) => arrow.name) ?? ""}
            placeholder={
              common((arrow) => arrow.name) === undefined ? "Mixed" : undefined
            }
            onChange={(event) => patch({ name: event.currentTarget.value })}
          />
        </label>
        <label className="canvas-property-control canvas-property-control-textarea">
          <span>Description</span>
          <textarea
            aria-label="Description"
            value={common((arrow) => arrow.description) ?? ""}
            placeholder={
              common((arrow) => arrow.description) === undefined
                ? "Mixed"
                : undefined
            }
            onChange={(event) =>
              patch({ description: event.currentTarget.value })
            }
          />
        </label>
      </div>
    </aside>
  );
}

function PropertyControl({
  field,
  onPatch,
}: {
  field: CanvasPropertyField;
  onPatch(patch: CanvasPropertyPatch): void;
}) {
  const mixed = field.value === CANVAS_MIXED_VALUE;
  const patch = (value: unknown) =>
    onPatch({ [field.name]: value } as CanvasPropertyPatch);
  return (
    <label className="canvas-property-control">
      <span>{field.label}</span>
      {field.control === "color" ? (
        <span className="canvas-property-color">
          <input
            type="color"
            aria-label={field.label}
            value={colorValue(field.value)}
            onChange={(event) => patch(colorNumber(event.currentTarget.value))}
          />
          <span>{mixed ? "Mixed" : colorValue(field.value).toUpperCase()}</span>
        </span>
      ) : field.control === "number" ? (
        <input
          type="number"
          aria-label={field.label}
          value={mixed ? "" : String(field.value)}
          placeholder={mixed ? "Mixed" : undefined}
          min={field.min}
          max={field.max}
          step={field.step}
          onChange={(event) => {
            if (event.currentTarget.value !== "")
              patch(event.currentTarget.valueAsNumber);
          }}
        />
      ) : field.control === "select" ? (
        <select
          aria-label={field.label}
          value={mixed ? CANVAS_MIXED_VALUE : String(field.value)}
          onChange={(event) => patch(event.currentTarget.value)}
        >
          {mixed && <option value={CANVAS_MIXED_VALUE}>Mixed</option>}
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          className="canvas-property-checkbox"
          type="checkbox"
          aria-label={field.label}
          checked={!mixed && field.value === true}
          onChange={(event) => patch(event.currentTarget.checked)}
        />
      )}
    </label>
  );
}
