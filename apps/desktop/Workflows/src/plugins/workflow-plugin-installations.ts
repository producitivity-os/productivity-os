import * as React from "react";
import { isTauriRuntime } from "../api/canvas-data.ts";
import { workflowPluginsData } from "../api/workflow-plugins-data.ts";
import { workflowPluginPackages } from "./workflow-plugin-registry.ts";
import { workflowPluginServices } from "./workflow-plugin-services.ts";
import { reportDataServiceIssue } from "@productivity-os/shared-ui/components/data-service-recovery";

let installed = new Set(
  workflowPluginPackages()
    .filter((plugin) => plugin.manifest.defaultInstalled)
    .map((plugin) => plugin.manifest.id),
);
let loaded = false;
let refreshPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function workflowPluginIsInstalled(pluginId: string): boolean {
  return installed.has(pluginId);
}

export async function refreshWorkflowPluginInstallations(): Promise<void> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const values = await workflowPluginsData.installations();
      installed = new Set(values.filter((item) => item.installed).map((item) => item.pluginId));
      loaded = true;
      notify();
    } catch (error) {
      reportDataServiceIssue(error);
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

export async function setWorkflowPluginInstalled(pluginId: string, value: boolean): Promise<void> {
  const changed = installed.has(pluginId) !== value;
  try {
    await workflowPluginsData.setInstalled(pluginId, value);
  } catch (error) {
    reportDataServiceIssue(error);
    return;
  }
  installed = new Set(installed);
  if (value) installed.add(pluginId);
  else installed.delete(pluginId);
  try {
    if (changed) {
      const plugin = workflowPluginPackages().find((candidate) => candidate.manifest.id === pluginId);
      if (value) await plugin?.onInstall?.(workflowPluginServices);
      else await plugin?.onUninstall?.(workflowPluginServices);
    }
  } finally {
    notify();
  }
}

export function useWorkflowPluginInstallations(): ReadonlySet<string> {
  const [, rerender] = React.useReducer((value) => value + 1, 0);
  React.useEffect(() => {
    listeners.add(rerender);
    if (!loaded) void refreshWorkflowPluginInstallations();
    const refresh = () => void refreshWorkflowPluginInstallations();
    window.addEventListener("workflows:plugins-changed", refresh);
    let unlisten: (() => void) | undefined;
    if (isTauriRuntime)
      void import("@tauri-apps/api/event").then(({ listen }) => listen("workflows:plugins-changed", refresh)).then((cleanup) => { unlisten = cleanup; });
    return () => {
      listeners.delete(rerender);
      window.removeEventListener("workflows:plugins-changed", refresh);
      unlisten?.();
    };
  }, []);
  return installed;
}
