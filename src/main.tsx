import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import "./globals.css";
import { Providers } from "./providers";
import App from "./App";
import TecnicosPage from "./TecnicosPage";

function Router() {
  const [page, setPage] = useState(() => window.location.hash.replace("#", "") || "app");

  useEffect(() => {
    const handler = () => setPage(window.location.hash.replace("#", "") || "app");
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  if (page === "tecnicos") return <TecnicosPage />;
  return <App />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Providers>
      <Router />
    </Providers>
  </React.StrictMode>
);
