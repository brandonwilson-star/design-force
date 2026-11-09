import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { DocsPage } from "./docs/DocsPage";
import { bootTheme } from "./lib/themes";
import { StudioProvider } from "./store";
import "./styles.css";

bootTheme();

const docs = window.location.pathname === "/docs";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {docs ? (
      <DocsPage />
    ) : (
      <StudioProvider>
        <App />
      </StudioProvider>
    )}
  </StrictMode>,
);
