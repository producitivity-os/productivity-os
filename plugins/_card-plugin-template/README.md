# Notes card plugin template

Copy this folder to `plugins/<plugin-id>`, update the manifest, and leave a default export from `index.tsx`.

The host discovers packages at build time. A card plugin owns its Zod schema, dimensions, create/hydrate/serialize/versioned-migrate handlers, toolbar icon, canvas rendering, hover label, overlay editor, property-panel policy, and install/create/activate/delete/dispose lifecycle hooks. The shared overlay owns Save, Cancel, focus trapping, keyboard shortcuts, structured field errors, and visual styling; the plugin supplies its draft, schema, and commit behavior. Media and global Person records are accessed through host services during commit, so Cancel never creates a card or managed media asset. Set `marketplace: false` for internal packages. Uninstalling a plugin hides its creation tool; existing cards remain stored and read-only until the package is re-enabled.
