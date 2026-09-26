import * as React from "react";
import { ArrowLeft, Check, Download, Power, Search } from "lucide-react";
import { Button } from "@productivity-os/shared-ui/components/ui/button";
import { Input } from "@productivity-os/shared-ui/components/ui/input";
import { workflowPluginPackages } from "@/plugins/workflow-plugin-registry";
import {
  setWorkflowPluginInstalled,
  useWorkflowPluginInstallations,
} from "@/plugins/workflow-plugin-installations";
import type { WorkflowPluginPalette } from "@productivity-os/workflow-plugin-sdk";

const fallbackPalette: WorkflowPluginPalette = {
  surface: "#f8fafc",
  border: "#3b82f6",
  foreground: "#172033",
  mutedForeground: "#64748b",
};

export function Plugins({ onBack }: { onBack(): void }) {
  const installed = useWorkflowPluginInstallations();
  const [pending, setPending] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const groups = React.useMemo(() => {
    const marketplace = workflowPluginPackages().filter((plugin) => plugin.manifest.marketplace !== false);
    const matching = marketplace.filter((plugin) => {
      if (!normalizedQuery) return true;
      return [
        plugin.manifest.app.name,
        plugin.manifest.name,
        plugin.manifest.description,
        ...plugin.nodes.flatMap((node) => [node.title, node.description]),
      ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
    });
    return Object.values(matching.reduce<Record<string, { app: typeof matching[number]["manifest"]["app"]; plugins: typeof matching }>>((result, plugin) => {
      const key = plugin.manifest.app.id;
      (result[key] ??= { app: plugin.manifest.app, plugins: [] }).plugins.push(plugin);
      return result;
    }, {})).sort((a, b) => a.app.name.localeCompare(b.app.name));
  }, [normalizedQuery]);
  return (
    <main className="canvas-plugins-page">
      <section>
        <header className="workflow-plugin-page-header">
          <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft /> Back to workflow</Button>
          <div><h1>Plugins</h1><p>Add trusted node types to every workflow.</p></div>
        </header>
        <label className="workflow-plugin-search">
          <Search aria-hidden="true" />
          <Input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search apps, plugins, and nodes" aria-label="Search plugins" />
        </label>
        <div className="workflow-plugin-marketplace">
          {groups.map(({ app, plugins }) => {
            const AppIcon = app.icon;
            const palette = app.palette ?? fallbackPalette;
            return <section className="workflow-plugin-app-group" key={app.id} style={{
              "--workflow-plugin-surface": palette.surface,
              "--workflow-plugin-border": palette.border,
              "--workflow-plugin-foreground": palette.foreground,
              "--workflow-plugin-muted": palette.mutedForeground,
            } as React.CSSProperties}>
              <header><span><AppIcon /></span><div><strong>{app.name}</strong><small>{plugins.length} {plugins.length === 1 ? "plugin" : "plugins"}</small></div></header>
              {plugins.map((plugin) => {
                const enabled = installed.has(plugin.manifest.id);
                const PluginIcon = plugin.nodes[0].icon;
                return (
                  <article key={plugin.manifest.id} className="workflow-plugin-card">
                    <span className="workflow-plugin-card-icon"><PluginIcon /></span>
                    <span className="workflow-plugin-card-copy">
                      <strong>{plugin.manifest.name}</strong>
                      <small>{plugin.manifest.description}</small>
                      <em>{plugin.nodes.map((node) => node.title).join(" · ")}</em>
                    </span>
                    <Button size="sm" variant={enabled ? "outline" : "default"} disabled={pending === plugin.manifest.id} onClick={() => {
                      setPending(plugin.manifest.id);
                      void setWorkflowPluginInstalled(plugin.manifest.id, !enabled).finally(() => setPending(null));
                    }}>
                      {enabled ? <><Power /> Disable</> : <><Download /> Install</>}
                    </Button>
                    <div className="workflow-plugin-marketplace-previews" aria-label={`${plugin.manifest.name} node previews`}>
                      {plugin.nodes.map((node) => {
                        const Preview = node.NodePickerPreview;
                        const NodeIcon = node.icon;
                        return <div key={node.nodeType}>{Preview
                          ? <Preview palette={palette} />
                          : <span className="workflow-plugin-node-preview">
                              <span className="workflow-plugin-preview-icon" aria-hidden="true"><NodeIcon /></span>
                              <span className="workflow-plugin-preview-copy"><strong>{node.title}</strong><small>{node.description}</small></span>
                            </span>}
                        </div>;
                      })}
                    </div>
                    {enabled && <span className="workflow-plugin-installed"><Check /> Installed</span>}
                  </article>
                );
              })}
            </section>;
          })}
          {groups.length === 0 && <p className="workflow-plugin-empty">No plugins match “{query}”.</p>}
        </div>
      </section>
    </main>
  );
}
