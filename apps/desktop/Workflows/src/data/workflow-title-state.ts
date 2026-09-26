export function updateWorkflowSummaryTitle<T extends { id: string; title: string }>(
  records: T[],
  canvasId: string,
  title: string,
): T[] {
  const existing = records.find((record) => record.id === canvasId);
  if (!existing || existing.title === title) return records;
  return records.map((record) =>
    record.id === canvasId ? { ...record, title } : record,
  );
}

export function updateWorkflowTabTitle<T extends { id: string; label: string }>(
  tabs: T[],
  canvasId: string,
  title: string,
  createTab: () => T,
): T[] {
  const existing = tabs.find((tab) => tab.id === canvasId);
  if (!existing) return [...tabs, createTab()];
  if (existing.label === title) return tabs;
  return tabs.map((tab) =>
    tab.id === canvasId ? { ...tab, label: title } : tab,
  );
}
