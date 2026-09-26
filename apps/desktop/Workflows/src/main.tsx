import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import "@productivity-os/shared-ui/globals.css";
import { SharedUiProvider } from "@productivity-os/shared-ui/components/shared-ui-provider";
import { ThemeProvider } from "@productivity-os/shared-ui/components/theme-provider";
import "./App.css";
import { App } from "./App.tsx";

const WORKFLOWS_THEME_KEY = "workflows-theme";
if (!window.localStorage.getItem(WORKFLOWS_THEME_KEY)) {
  const legacyTheme = window.localStorage.getItem("canvas-theme");
  if (legacyTheme)
    window.localStorage.setItem(WORKFLOWS_THEME_KEY, legacyTheme);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey={WORKFLOWS_THEME_KEY}>
      <SharedUiProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </SharedUiProvider>
    </ThemeProvider>
  </StrictMode>,
);
