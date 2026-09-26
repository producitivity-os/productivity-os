const ADD_SUBTASK_EVENT = "productivity-os:workflow-add-subtask";

type AddSubtaskEvent = CustomEvent<{ taskId: string }>;

export function requestWorkflowSubtaskDraft(taskId: string): void {
  window.requestAnimationFrame(() => {
    window.dispatchEvent(
      new CustomEvent(ADD_SUBTASK_EVENT, { detail: { taskId } }),
    );
  });
}

export function subscribeWorkflowSubtaskDraft(
  taskId: string,
  listener: () => void,
): () => void {
  const handle = (event: Event) => {
    if ((event as AddSubtaskEvent).detail.taskId === taskId) listener();
  };
  window.addEventListener(ADD_SUBTASK_EVENT, handle);
  return () => window.removeEventListener(ADD_SUBTASK_EVENT, handle);
}
