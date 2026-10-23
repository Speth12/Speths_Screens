import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import "./index.css";
import "./store/alarmEngine";
import { bootAuditTrail } from "./store/auditTrail";
import { bootExpressionEngine } from "./store/expressionEngine";
import { bootHistorian } from "./store/historian";

bootAuditTrail();
bootExpressionEngine();
bootHistorian();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
