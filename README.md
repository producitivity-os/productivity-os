# Productivity OS

The workspace shares application data through a standalone Rust data service. The service owns the SQLite database and exposes typed, length-prefixed JSON commands over a Unix socket; desktop apps use `data-client` and never open SQLite directly.

Start the service before a desktop app:

```sh
cargo run -p data-service
yarn workflows:tauri:dev
```

After updating the workspace, restart any already-running data service so the desktop client and IPC protocol use the same build.

Runtime settings live in `productivity-os.yaml`. Set `PRODUCTIVITY_OS_CONFIG` to an absolute `.yaml`, `.yml`, or `.json` path to use another configuration. Relative database paths resolve from the configuration file’s directory. Workflows displays the effective service settings as read-only status information.

The shared schema keeps generic canvas documents, canvas state, layers, objects, previews, and cross-app card projections in separate tables. Workflows autosaves complete snapshots—including viewport position and scale—after the configured debounce and flushes pending state when navigating or closing the window.
