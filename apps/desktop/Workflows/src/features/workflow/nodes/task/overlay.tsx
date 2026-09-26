import * as React from "react";
import { Check, GripVertical, Trash2 } from "lucide-react";
import type {
  CanvasObject,
  CanvasObjectOverlaySlotProps,
} from "@productivity-os/canvas";
import {
  isWorkflowNode,
  type WorkflowSubtask,
  type WorkflowTaskNode,
} from "../index.ts";
import { workflowTaskLayout } from "./layout.ts";
import {
  workflowCompletionUpdates,
  workflowNodeCanInteract,
} from "../progression.ts";
import { subscribeWorkflowSubtaskDraft } from "./editor-events.ts";

type TaskSnapshot = Pick<
  WorkflowTaskNode,
  | "subtasks"
  | "completed"
  | "subtasksCollapsed"
  | "expandedHeight"
  | "height"
>;

type TaskTransaction = {
  kind: "add" | "edit" | "reorder";
  subtaskId?: string;
  original: TaskSnapshot;
};

function cloneTaskSnapshot(task: WorkflowTaskNode): TaskSnapshot {
  return {
    subtasks: task.subtasks.map((subtask) => ({ ...subtask })),
    completed: task.completed,
    subtasksCollapsed: task.subtasksCollapsed,
    expandedHeight: task.expandedHeight,
    height: task.height,
  };
}

function subtaskPatch(
  task: WorkflowTaskNode,
  subtasks: readonly WorkflowSubtask[],
  collapsed = task.subtasksCollapsed,
): Partial<WorkflowTaskNode> {
  const nextSubtasks = subtasks.map((subtask) => ({ ...subtask }));
  const expandedHeight = workflowTaskLayout.minimumHeightFor(nextSubtasks.length);
  const subtasksCollapsed = nextSubtasks.length > 0 && collapsed;
  return {
    subtasks: nextSubtasks,
    completed: workflowTaskLayout.completed(nextSubtasks, task.completed),
    subtasksCollapsed,
    expandedHeight,
    height: subtasksCollapsed ? workflowTaskLayout.collapsedHeight : expandedHeight,
  };
}

export function WorkflowTaskNodeOverlay(
  props: CanvasObjectOverlaySlotProps,
) {
  if (!isWorkflowNode(props.object) || props.object.nodeKind !== "task")
    return null;
  return <TaskEditor {...props} task={props.object as WorkflowTaskNode} />;
}

function TaskEditor({
  task,
  viewport,
  getObjects,
  update,
  updateObjects,
  beginMutation,
  commitMutation,
}: CanvasObjectOverlaySlotProps & { task: WorkflowTaskNode }) {
  const taskRef = React.useRef(task);
  const transactionRef = React.useRef<TaskTransaction | null>(null);
  const inputRefs = React.useRef(new Map<string, HTMLInputElement>());
  const draggedIdRef = React.useRef<string | null>(null);
  const [draggedId, setDraggedId] = React.useState<string | null>(null);
  taskRef.current = task;

  const currentTask = React.useCallback(() => {
    const current = getObjects().find(
      (object): object is WorkflowTaskNode =>
        isWorkflowNode(object) && object.nodeKind === "task" && object.id === task.id,
    );
    return current ?? taskRef.current;
  }, [getObjects, task.id]);

  const beginTransaction = React.useCallback((
    kind: TaskTransaction["kind"],
    subtaskId?: string,
  ) => {
    if (transactionRef.current) commitMutation();
    const current = currentTask();
    beginMutation();
    transactionRef.current = {
      kind,
      subtaskId,
      original: cloneTaskSnapshot(current),
    };
  }, [beginMutation, commitMutation, currentTask]);

  const updateSubtasks = React.useCallback((
    subtasks: readonly WorkflowSubtask[],
    collapsed?: boolean,
  ) => {
    const current = currentTask();
    const patch = subtaskPatch(
      current,
      subtasks,
      collapsed ?? current.subtasksCollapsed,
    );
    const completes = !current.completed && patch.completed;
    if (completes) {
      updateObjects(
        workflowCompletionUpdates(
          getObjects(),
          current.id,
          patch as Partial<CanvasObject>,
        ),
      );
    } else {
      update(patch as Partial<CanvasObject>);
    }
  }, [currentTask, getObjects, update, updateObjects]);

  const restoreTransaction = React.useCallback(() => {
    const transaction = transactionRef.current;
    if (!transaction) return;
    update(transaction.original as Partial<CanvasObject>);
    transactionRef.current = null;
    commitMutation();
  }, [commitMutation, update]);

  const commitTransaction = React.useCallback(() => {
    if (!transactionRef.current) return;
    transactionRef.current = null;
    commitMutation();
  }, [commitMutation]);

  const editName = React.useCallback((subtaskId: string, name: string) => {
    const current = currentTask();
    updateSubtasks(
      current.subtasks.map((subtask) =>
        subtask.id === subtaskId ? { ...subtask, name } : subtask,
      ),
    );
  }, [currentTask, updateSubtasks]);

  const finishName = React.useCallback((subtaskId: string, value: string) => {
    const transaction = transactionRef.current;
    if (!transaction || transaction.subtaskId !== subtaskId) return;
    const name = value.trim();
    if (!name) {
      restoreTransaction();
      return;
    }
    editName(subtaskId, name);
    commitTransaction();
  }, [commitTransaction, editName, restoreTransaction]);

  const addDraft = React.useCallback(() => {
    if (transactionRef.current) commitTransaction();
    const current = currentTask();
    const id = crypto.randomUUID();
    beginTransaction("add", id);
    updateSubtasks(
      [...current.subtasks, { id, name: "", completed: false }],
      false,
    );
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => inputRefs.current.get(id)?.focus());
    });
  }, [beginTransaction, commitTransaction, currentTask, updateSubtasks]);

  React.useEffect(
    () => subscribeWorkflowSubtaskDraft(task.id, addDraft),
    [addDraft, task.id],
  );

  const canComplete = workflowNodeCanInteract(getObjects(), task.id);
  if (task.subtasksCollapsed) return null;

  return (
    <div
      className="workflow-task-node-overlay"
      style={{
        width: task.width,
        height: task.height,
        transform: `scale(${viewport.scale})`,
      }}
    >
      <div className="workflow-task-node-subtasks">
        {task.subtasks.map((subtask) => (
          <div
            key={subtask.id}
            className="workflow-task-node-subtask"
            data-completed={subtask.completed || undefined}
            data-dragging={draggedId === subtask.id || undefined}
            onDragOver={(event) => {
              const dragged = draggedIdRef.current;
              if (!dragged || dragged === subtask.id) return;
              event.preventDefault();
              const current = currentTask();
              const from = current.subtasks.findIndex((item) => item.id === dragged);
              const to = current.subtasks.findIndex((item) => item.id === subtask.id);
              if (from < 0 || to < 0 || from === to) return;
              const next = [...current.subtasks];
              const [moved] = next.splice(from, 1);
              next.splice(to, 0, moved);
              updateSubtasks(next);
            }}
            onDrop={(event) => {
              event.preventDefault();
              draggedIdRef.current = null;
              setDraggedId(null);
              commitTransaction();
            }}
          >
            <button
              type="button"
              className="workflow-task-node-checkbox"
              aria-label={subtask.completed ? `Mark ${subtask.name} incomplete` : `Complete ${subtask.name}`}
              aria-pressed={subtask.completed}
              disabled={!canComplete}
              onClick={() => {
                const current = currentTask();
                updateSubtasks(
                  current.subtasks.map((item) =>
                    item.id === subtask.id
                      ? { ...item, completed: !item.completed }
                      : item,
                  ),
                );
              }}
            >
              {subtask.completed && <Check aria-hidden="true" />}
            </button>
            <input
              ref={(node) => {
                if (node) inputRefs.current.set(subtask.id, node);
                else inputRefs.current.delete(subtask.id);
              }}
              value={subtask.name}
              aria-label={`Subtask ${subtask.name || "name"}`}
              placeholder="Subtask"
              onFocus={() => {
                const transaction = transactionRef.current;
                if (transaction?.subtaskId === subtask.id) return;
                beginTransaction("edit", subtask.id);
              }}
              onChange={(event) => {
                const name = event.currentTarget.value;
                editName(subtask.id, name);
              }}
              onBlur={(event) => finishName(subtask.id, event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  finishName(subtask.id, event.currentTarget.value);
                  event.currentTarget.blur();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  restoreTransaction();
                  event.currentTarget.blur();
                }
              }}
            />
            <span className="workflow-task-node-row-actions">
              <button
                type="button"
                className="workflow-task-node-drag"
                draggable
                aria-label={`Reorder ${subtask.name || "subtask"}`}
                onDragStart={(event) => {
                  beginTransaction("reorder");
                  draggedIdRef.current = subtask.id;
                  setDraggedId(subtask.id);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", subtask.id);
                }}
                onDragEnd={() => {
                  draggedIdRef.current = null;
                  setDraggedId(null);
                  commitTransaction();
                }}
              >
                <GripVertical aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={`Delete ${subtask.name || "subtask"}`}
                onClick={() => {
                  const current = currentTask();
                  updateSubtasks(
                    current.subtasks.filter((item) => item.id !== subtask.id),
                  );
                }}
              >
                <Trash2 aria-hidden="true" />
              </button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
