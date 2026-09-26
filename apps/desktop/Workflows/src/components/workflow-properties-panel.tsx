import type { CanvasPropertiesSlotProps } from "@productivity-os/canvas";
import { DurationPicker } from "@productivity-os/shared-ui/components/duration-picker";
import {
  type WorkflowLinkNode,
  type WorkflowMilestoneNode,
  type WorkflowMilestoneStatus,
  type WorkflowTimerNode,
  type WorkflowPluginNode,
  type WorkflowTaskNode,
  type WorkflowTerminatorNode,
  type WorkflowTerminatorRole,
  type WorkflowResetSchedule,
  MAX_TIMER_DURATION_MS,
  MIN_TIMER_DURATION_MS,
} from "@/features/workflow/nodes";
import { WorkflowNodePropertySelection } from "@/features/workflow/nodes/properties";
import { workflowCompletionUpdates, workflowNodeCanInteract } from "@/features/workflow/nodes/progression";
import { timerElapsed } from "@/features/workflow/nodes/timer/lifecycle";
import { workflowPluginDefinition } from "@/plugins/workflow-plugin-registry";
import { workflowPluginServices } from "@/plugins/workflow-plugin-services";

export type WorkflowDestination = {
  id: string;
  title: string;
};

type WorkflowPropertiesPanelProps = Pick<
  CanvasPropertiesSlotProps,
  "selection" | "updateObject" | "updateObjects"
> & {
  destinations: readonly WorkflowDestination[];
  getObjects(): readonly import("@productivity-os/canvas").CanvasObject[];
  workflowId: string;
  installedPluginIds: ReadonlySet<string>;
};

export function WorkflowPropertiesPanel({
  selection,
  updateObject,
  updateObjects,
  destinations,
  getObjects,
  workflowId,
  installedPluginIds,
}: WorkflowPropertiesPanelProps) {
  const target = WorkflowNodePropertySelection.from(selection.selectedObjects);
  if (!target) return null;
  const title =
    target.nodes.length === 1
      ? `${target.nodeKind} properties`
      : `${target.nodes.length} ${target.nodeKind} nodes`;
  const patch = (values: Parameters<typeof target.patch>[1]) =>
    target.patch(updateObject, values);

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
        {target.nodeKind === "terminator" && (
          <>
            <SelectControl
              label="Role"
              value={target.common(
                (node) => (node as WorkflowTerminatorNode).role,
              )}
              options={[
                { value: "Start", label: "Start" },
                { value: "End", label: "End" },
              ]}
              onChange={(role) =>
                target.patchEach(updateObject, (node) => {
                  const terminator = node as WorkflowTerminatorNode;
                  return {
                    role: role as WorkflowTerminatorRole,
                    name:
                      terminator.name === terminator.role
                        ? role
                        : terminator.name,
                  } as Partial<WorkflowTerminatorNode>;
                })
              }
            />
            <TextControl
              label="Name"
              value={target.common((node) => node.name)}
              onChange={(name) => patch({ name })}
            />
            {target.nodes.every(
              (node) => (node as WorkflowTerminatorNode).role === "Start",
            ) && (
              <ResetScheduleControls
                target={target}
                updateObject={updateObject}
              />
            )}
          </>
        )}
        {target.nodeKind === "task" && (
          <TaskControls
            target={target}
            updateObject={updateObject}
          />
        )}
        {target.nodeKind === "timer" && (
          <TimerControls
            target={target}
            updateObject={updateObject}
            updateObjects={updateObjects}
            getObjects={getObjects}
          />
        )}
        {target.nodeKind === "milestone" && (
          <>
            <TextControl
              label="Name"
              value={target.common((node) => node.name)}
              onChange={(name) => patch({ name })}
            />
            <SelectControl
              label="Status"
              value={target.common(
                (node) => (node as WorkflowMilestoneNode).status,
              )}
              options={[
                { value: "pending", label: "Pending" },
                { value: "reached", label: "Reached" },
                { value: "blocked", label: "Blocked" },
              ]}
              onChange={(status) =>
                patch({
                  status: status as WorkflowMilestoneStatus,
                } as Partial<WorkflowMilestoneNode>)
              }
            />
          </>
        )}
        {target.nodeKind === "link" && (
          <>
            <TextControl
              label="Label"
              value={target.common((node) => node.name)}
              onChange={(name) => patch({ name })}
            />
            <DestinationControl
              target={target}
              destinations={destinations}
              updateObject={updateObject}
            />
          </>
        )}
        {target.nodeKind === "plugin" && (
          <PluginControls
            target={target}
            workflowId={workflowId}
            installedPluginIds={installedPluginIds}
            updateObject={updateObject}
            updateObjects={updateObjects}
            getObjects={getObjects}
          />
        )}
      </div>
    </aside>
  );
}

function PluginControls({
  target,
  workflowId,
  installedPluginIds,
  updateObject,
  updateObjects,
  getObjects,
}: {
  target: WorkflowNodePropertySelection;
  workflowId: string;
  installedPluginIds: ReadonlySet<string>;
  updateObject: CanvasPropertiesSlotProps["updateObject"];
  updateObjects: CanvasPropertiesSlotProps["updateObjects"];
  getObjects(): readonly import("@productivity-os/canvas").CanvasObject[];
}) {
  if (target.nodes.length !== 1)
    return <div className="canvas-property-help">Select one plugin node to edit it.</div>;
  const node = target.nodes[0] as WorkflowPluginNode;
  const definition = workflowPluginDefinition(node.pluginId, node.pluginNodeType);
  if (!definition || !installedPluginIds.has(node.pluginId))
    return <div className="canvas-property-help">This plugin is unavailable. Reinstall it from Plugins to edit this node.</div>;
  const Editor = definition.PropertiesEditor;
  if (!Editor) return <div className="canvas-property-help">This node has no editable properties.</div>;
  return (
    <Editor
      node={node}
      workflowId={workflowId}
      services={workflowPluginServices}
      canInteract={workflowNodeCanInteract(getObjects(), node.id)}
      canExecute={workflowNodeCanInteract(getObjects(), node.id)}
      updateNode={(patch) => updateObject(node.id, patch as Partial<import("@productivity-os/canvas").CanvasObject>)}
      completeNode={(pluginData) => {
        if (node.completed) {
          updateObject(node.id, { pluginData } as Partial<import("@productivity-os/canvas").CanvasObject>);
          return;
        }
        if (!workflowNodeCanInteract(getObjects(), node.id)) return;
        updateObjects(workflowCompletionUpdates(getObjects(), node.id, {
          pluginData,
          completed: true,
        } as Partial<import("@productivity-os/canvas").CanvasObject>));
        void Promise.resolve().then(() =>
          definition.onComplete?.(node, workflowId, workflowPluginServices),
        ).catch((error) => console.warn("Workflow plugin completion hook failed", error));
      }}
    />
  );
}

function ResetScheduleControls({
  target,
  updateObject,
}: {
  target: WorkflowNodePropertySelection;
  updateObject: CanvasPropertiesSlotProps["updateObject"];
}) {
  const scheduleKind = target.common(
    (node) => (node as WorkflowTerminatorNode).resetSchedule.kind,
  );
  const hours = target.common((node) => {
    const schedule = (node as WorkflowTerminatorNode).resetSchedule;
    return schedule.kind === "interval" ? schedule.everyHours : 24;
  });
  const patchSchedule = (create: (current: WorkflowResetSchedule) => WorkflowResetSchedule) =>
    target.patchEach(updateObject, (node) => ({
      resetSchedule: create((node as WorkflowTerminatorNode).resetSchedule),
    }) as Partial<WorkflowTerminatorNode>);
  return (
    <>
      <SelectControl
        label="Reset"
        value={scheduleKind}
        options={[
          { value: "never", label: "Never" },
          { value: "daily", label: "Daily" },
          { value: "interval", label: "Every x hours" },
        ]}
        onChange={(kind) =>
          patchSchedule(() =>
            kind === "daily"
              ? { kind: "daily", lastResetAt: Date.now() }
              : kind === "interval"
                ? { kind: "interval", everyHours: hours ?? 24, lastResetAt: Date.now() }
                : { kind: "never", lastResetAt: Date.now() },
          )
        }
      />
      {scheduleKind === "interval" && (
        <NumberControl
          label="Every (hours)"
          value={hours}
          min={1}
          max={720}
          onChange={(everyHours) =>
            patchSchedule((current) => ({
              kind: "interval",
              everyHours,
              lastResetAt: current.lastResetAt ?? Date.now(),
            }))
          }
        />
      )}
      {scheduleKind && scheduleKind !== "never" && (
        <div className="canvas-property-help">
          Resets the completion state of every node connected to this Start node while keeping its content.
        </div>
      )}
    </>
  );
}

function TaskControls({
  target,
  updateObject,
}: {
  target: WorkflowNodePropertySelection;
  updateObject: CanvasPropertiesSlotProps["updateObject"];
}) {
  const patch = (values: Partial<WorkflowTaskNode>) =>
    target.patch(updateObject, values);
  return (
    <TextControl
      label="Name"
      value={target.common((node) => node.name)}
      onChange={(name) => patch({ name })}
    />
  );
}

function TimerControls({
  target,
  updateObject,
  updateObjects,
  getObjects,
}: {
  target: WorkflowNodePropertySelection;
  updateObject: CanvasPropertiesSlotProps["updateObject"];
  updateObjects: CanvasPropertiesSlotProps["updateObjects"];
  getObjects(): readonly import("@productivity-os/canvas").CanvasObject[];
}) {
  const timers = target.nodes as readonly WorkflowTimerNode[];
  const patch = (values: Partial<WorkflowTimerNode>) =>
    target.patch(updateObject, values);
  const durationMs = target.common((node) => (node as WorkflowTimerNode).durationMs);
  return (
    <>
      <TextControl
        label="Name"
        value={target.common((node) => node.name)}
        onChange={(name) => patch({ name })}
      />
      <label className="canvas-property-control">
        <span>Duration</span>
        <DurationPicker
        valueMs={durationMs ?? 25 * 60_000}
        minMs={MIN_TIMER_DURATION_MS}
        maxMs={MAX_TIMER_DURATION_MS}
        onChange={(durationMs) => {
          const now = Date.now();
          for (const timer of timers) {
            const elapsedMs = timerElapsed(timer, now);
            if (elapsedMs >= durationMs) {
              updateObjects(
                workflowCompletionUpdates(getObjects(), timer.id, {
                  durationMs,
                  elapsedMs: durationMs,
                  startedAt: null,
                  timerStatus: "completed",
                } as Partial<import("@productivity-os/canvas").CanvasObject>),
              );
            } else {
              updateObject(timer.id, {
                durationMs,
                elapsedMs,
                startedAt: timer.timerStatus === "running" ? now : null,
              } as Partial<WorkflowTimerNode>);
            }
          }
        }} />
      </label>
    </>
  );
}

function DestinationControl({
  target,
  destinations,
  updateObject,
}: {
  target: WorkflowNodePropertySelection;
  destinations: readonly WorkflowDestination[];
  updateObject: CanvasPropertiesSlotProps["updateObject"];
}) {
  const links = target.nodes as readonly WorkflowLinkNode[];
  const value = target.common(
    (node) => (node as WorkflowLinkNode).targetCanvasId,
  );
  const missing =
    value && !destinations.some((destination) => destination.id === value)
      ? {
          id: value,
          title: links[0].targetCanvasTitle || "Unavailable workflow",
        }
      : null;
  const options = missing ? [...destinations, missing] : destinations;
  return (
    <SelectControl
      label="Workflow"
      value={value}
      options={[
        { value: "", label: "Not linked" },
        ...options.map((destination) => ({
          value: destination.id,
          label: destination.title,
        })),
      ]}
      onChange={(targetCanvasId) => {
        const destination = options.find(
          (candidate) => candidate.id === targetCanvasId,
        );
        target.patch(updateObject, {
          targetCanvasId,
          targetCanvasTitle: destination?.title ?? "",
        } as Partial<WorkflowLinkNode>);
      }}
    />
  );
}

function TextControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | undefined;
  onChange(value: string): void;
}) {
  return (
    <label className="canvas-property-control">
      <span>{label}</span>
      <input
        aria-label={label}
        value={value ?? ""}
        placeholder={value === undefined ? "Mixed" : undefined}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  );
}

function NumberControl({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number | undefined;
  min: number;
  max: number;
  onChange(value: number): void;
}) {
  return (
    <label className="canvas-property-control">
      <span>{label}</span>
      <input
        type="number"
        aria-label={label}
        value={value ?? ""}
        placeholder={value === undefined ? "Mixed" : undefined}
        min={min}
        max={max}
        step={1}
        onChange={(event) => {
          const next = event.currentTarget.valueAsNumber;
          if (Number.isFinite(next))
            onChange(Math.min(max, Math.max(min, next)));
        }}
      />
    </label>
  );
}

function SelectControl({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | undefined;
  options: readonly { value: string; label: string }[];
  onChange(value: string): void;
}) {
  return (
    <label className="canvas-property-control">
      <span>{label}</span>
      <select
        aria-label={label}
        value={value ?? "__mixed__"}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        {value === undefined && (
          <option value="__mixed__" disabled>
            Mixed
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
