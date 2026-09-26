import * as React from "react";
import { Bell, CircleDot, Database, FileCode2, Palette, Settings2, SlidersHorizontal } from "lucide-react";
import { canvasData, type DataServiceStatus } from "@/api/canvas-data";

export function Settings() {
  const [status, setStatus] = React.useState<DataServiceStatus | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void canvasData.status().then((nextStatus) => { if (!cancelled) setStatus(nextStatus); });
    return () => { cancelled = true; };
  }, []);

  const settings = status?.activeSettings ?? status?.configuredSettings;
  return (
    <main className="canvas-settings-page">
      <section>
        <span className="canvas-settings-icon"><Settings2 /></span>
        <small>Workflows workspace</small>
        <h1>Settings</h1>
        <p>Choose how this workspace looks and behaves.</p>
        <div className="canvas-settings-list">
          <button type="button" disabled><Palette /><span><strong>Appearance</strong><small>Theme and workflow colors</small></span></button>
          <button type="button" disabled><Bell /><span><strong>Notifications</strong><small>Updates and mentions</small></span></button>
          <button type="button" disabled><SlidersHorizontal /><span><strong>Workflow defaults</strong><small>Tools, layers, and exports</small></span></button>
        </div>
        <div className="canvas-service-settings" aria-live="polite">
          <div className="canvas-service-settings-heading">
            <Database />
            <span><strong>Shared data service</strong><small>Read-only values from productivity-os.yaml</small></span>
            <span className={status?.connected ? "connected" : "disconnected"}><CircleDot />{status?.connected ? "Connected" : "Unavailable"}</span>
          </div>
          {settings ? (
            <dl>
              <div><dt>Socket</dt><dd>{settings.socketPath}</dd></div>
              <div><dt>Database</dt><dd>{settings.databasePath}</dd></div>
              <div><dt>Autosave</dt><dd>{settings.canvasAutosaveDebounceMs} ms</dd></div>
              <div><dt>Connections</dt><dd>{settings.maxConnections}</dd></div>
            </dl>
          ) : (
            <p>{status?.error ?? "Checking data service…"}</p>
          )}
          <small className="canvas-service-settings-note"><FileCode2 />Edit the root YAML or set PRODUCTIVITY_OS_CONFIG, then restart the service.</small>
        </div>
      </section>
    </main>
  );
}
