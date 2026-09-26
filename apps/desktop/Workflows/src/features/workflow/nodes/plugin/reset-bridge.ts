type PluginData = Record<string, unknown>;

type WorkflowPluginResetter = (
  pluginId: string,
  nodeType: string,
  data: PluginData,
) => PluginData;

let resetter: WorkflowPluginResetter | null = null;

export function setWorkflowPluginResetter(next: WorkflowPluginResetter): void {
  resetter = next;
}

export function resetWorkflowPluginData(
  pluginId: string,
  nodeType: string,
  data: PluginData,
): PluginData {
  return resetter?.(pluginId, nodeType, data) ?? { ...data };
}
