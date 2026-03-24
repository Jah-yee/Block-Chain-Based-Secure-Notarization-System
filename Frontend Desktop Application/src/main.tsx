import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { ThemeProvider } from "./components/theme-provider";
import { Toaster } from "./components/ui/sonner";

import { ConfigAuthorityProvider } from "./contexts/ConfigAuthority";
import { ConfigBarrier } from "./components/ConfigBarrier";

createRoot(document.getElementById("root")!).render(
  <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
    <ConfigAuthorityProvider>
      <ConfigBarrier>
        <App />
        <Toaster />
      </ConfigBarrier>
    </ConfigAuthorityProvider>
  </ThemeProvider>
);
