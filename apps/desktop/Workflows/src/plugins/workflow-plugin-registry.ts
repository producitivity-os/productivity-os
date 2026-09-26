import type { WorkflowNodePluginDefinition, WorkflowNodePluginPackage } from "./workflow-plugin-api.tsx";

const modules = import.meta.glob<{ default: WorkflowNodePluginPackage }>(
  "../../../../plugins/workflows/*/index.tsx",
  { eager: true },
);

const packages = Object.values(modules)
  .map((module) => module.default)
  .filter((plugin): plugin is WorkflowNodePluginPackage => Boolean(plugin?.manifest?.id));

const definitions = new Map<string, WorkflowNodePluginDefinition<any>>();
for (const plugin of packages) {
  for (const definition of plugin.nodes)
    definitions.set(`${plugin.manifest.id}:${definition.nodeType}`, definition);
}

export function workflowPluginPackages(): readonly WorkflowNodePluginPackage[] {
  return packages;
}

export function workflowPluginDefinition(pluginId: string, nodeType: string): WorkflowNodePluginDefinition<any> | null {
  return definitions.get(`${pluginId}:${nodeType}`) ?? null;
}

export function workflowPluginDefinitions(pluginIds: ReadonlySet<string>): Array<{
  plugin: WorkflowNodePluginPackage;
  definition: WorkflowNodePluginDefinition<any>;
}> {
  return packages.flatMap((plugin) =>
    pluginIds.has(plugin.manifest.id)
      ? plugin.nodes.map((definition) => ({ plugin, definition }))
      : [],
  );
}
