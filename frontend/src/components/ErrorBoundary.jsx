import React from "react";
import { clientErrorReportUrl } from "../config/api";
import { boundaryAccount, canSeeErrorDetails, makeSupportCode } from "../lib/errorScreen";
import "../styles/error-boundary.css";

function IconRefresh({ size = 14, style }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 16h5v5" />
    </svg>
  );
}

function IconHome({ size = 14, style }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      <path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V9.5z" />
    </svg>
  );
}

import { t } from "../i18n/runtime";
import RouteLoadingScreen from "./boot/RouteLoadingScreen";
import { isModuleLoadError, recoverFromModuleLoadError } from "../lib/moduleLoadError";
import { reportReactError } from "../lib/sentry";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      recovering: false,
      message: "",
      stack: "",
      componentStack: "",
      supportCode: "",
      detailsOpen: false,
    };
  }

  static getDerivedStateFromError(error) {
    const supportCode = makeSupportCode();
    if (isModuleLoadError(error)) {
      return {
        hasError: false,
        recovering: true,
        supportCode,
        message: error?.message || t("Unexpected runtime error"),
        stack: error?.stack || "",
      };
    }
    return {
      hasError: true,
      supportCode,
      message: error?.message || t("Unexpected runtime error"),
      stack: error?.stack || "",
    };
  }

  componentDidCatch(error, errorInfo) {
    if (isModuleLoadError(error) && recoverFromModuleLoadError()) {
      return;
    }
    if (isModuleLoadError(error)) {
      this.setState({
        hasError: true,
        recovering: false,
        error,
        errorInfo,
        message: error?.message || t("An unexpected error occurred."),
        stack: error?.stack,
        componentStack: errorInfo?.componentStack,
      });
      return;
    }
    // Get detailed information
    const userData = this.getUserData();
    const category = this.categorizeError(error);
    const systemInfo = this.getSystemInfo();
    const connectionInfo = this.getConnectionInfo();

    this.setState({
      hasError: true,
      error: error,
      errorInfo: errorInfo,
      message: error?.message || t("An unexpected error occurred."),
      stack: error?.stack,
      componentStack: errorInfo?.componentStack,
      userData,
      category,
      systemInfo,
      connectionInfo,
    });

    console.error("[Descall] Error Boundary Caught:", {
      error,
      errorInfo,
      userData,
      category,
      systemInfo,
      connectionInfo,
    });

    // Crash report to Sentry (no-op outside production web/desktop/iOS builds).
    reportReactError(error, errorInfo);

    // Log error to backend
    this.logErrorToBackend(error, errorInfo);
  }

  logErrorToBackend = async (error, errorInfo) => {
    // Prevent recursive error logging
    if (this.isLoggingError) {
      console.warn("[Descall] Already logging an error, skipping to prevent loop");
      return;
    }
    
    this.isLoggingError = true;
    
    try {
      // Get detailed user information
      const userData = this.getUserData();
      
      // Categorize error
      const category = this.categorizeError(error);
      
      // Get system information
      const systemInfo = this.getSystemInfo();
      
      const errorData = {
        // Error details
        message: `[${this.state.supportCode || "unknown"}] ${error?.message || "Unknown error"}`,
        name: error?.name || "Error",
        stack: error?.stack || "",
        componentStack: errorInfo?.componentStack || "",
        
        // Categorization
        category: category.type,
        severity: category.severity,
        
        // User details
        userId: userData.id,
        username: userData.username,
        userEmail: userData.email,
        userRole: userData.role,
        sessionId: userData.sessionId,
        
        // System details
        url: systemInfo.url,
        referrer: systemInfo.referrer,
        userAgent: systemInfo.userAgent,
        platform: systemInfo.platform,
        language: systemInfo.language,
        screenResolution: systemInfo.screenResolution,
        viewport: systemInfo.viewport,
        timezone: systemInfo.timezone,
        
        // Timestamp
        timestamp: new Date().toISOString(),
        clientTimestamp: Date.now(),
        
        // Additional context
        isOnline: navigator.onLine,
        connection: this.getConnectionInfo(),
      };

      const response = await fetch(clientErrorReportUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(errorData),
      });

      if (!response.ok) {
        console.error("[Descall] Failed to log error:", response.status);
      } else {
        console.log("[Descall] Error logged successfully");
      }
    } catch (err) {
      console.error("[Descall] Failed to log error to backend:", err);
    }
  };

  getUserData = () => {
    try {
      const stored = localStorage.getItem("descall_user");
      if (!stored || stored === "null" || stored === "undefined") return boundaryAccount(null);
      return boundaryAccount(JSON.parse(stored));
    } catch (e) {
      console.error("[ErrorBoundary] Failed to parse user data:", e);
      return boundaryAccount(null);
    }
  };

  categorizeError = (error) => {
    const message = (error?.message || "").toLowerCase();
    const stack = (error?.stack || "").toLowerCase();
    const name = (error?.name || "").toLowerCase();
    
    // Activity is not defined - specific fix
    if (message.includes("activity") || message.includes("is not defined") || message.includes("cannot read")) {
      return { type: "REFERENCE_ERROR", severity: "high" };
    }
    
    if (name.includes("referenceerror") || message.includes("undefined") || message.includes("null")) {
      return { type: "RUNTIME_ERROR", severity: "high" };
    }
    if (name.includes("syntaxerror") || message.includes("syntax") || message.includes("unexpected token")) {
      return { type: "SYNTAX_ERROR", severity: "critical" };
    }
    if (message.includes("network") || message.includes("fetch") || message.includes("xhr") || message.includes("timeout")) {
      return { type: "NETWORK_ERROR", severity: "medium" };
    }
    if (message.includes("permission") || message.includes("denied") || message.includes("unauthorized") || message.includes("forbidden")) {
      return { type: "AUTH_ERROR", severity: "medium" };
    }
    if (stack.includes("react") || stack.includes("component") || name.includes("react")) {
      return { type: "UI_ERROR", severity: "high" };
    }
    if (message.includes("webrtc") || message.includes("rtc") || message.includes("media") || stack.includes("webrtc")) {
      return { type: "WEBRTC_ERROR", severity: "high" };
    }
    if (name.includes("typeerror") || message.includes("type")) {
      return { type: "TYPE_ERROR", severity: "medium" };
    }
    if (message.includes("memory") || message.includes("heap") || message.includes("out of memory")) {
      return { type: "MEMORY_ERROR", severity: "critical" };
    }
    
    return { type: "UNKNOWN_ERROR", severity: "medium" };
  };

  getSystemInfo = () => {
    return {
      url: window.location.href,
      referrer: document.referrer || "direct",
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      screenResolution: `${window.screen.width}x${window.screen.height}`,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  };

  getConnectionInfo = () => {
    const conn = navigator.connection;
    if (conn) {
      return {
        effectiveType: conn.effectiveType,
        downlink: conn.downlink,
        rtt: conn.rtt,
        saveData: conn.saveData,
      };
    }
    return null;
  };

  handleRetry = () => {
    if (this.props.scope === "pane") {
      this.setState({
        hasError: false,
        recovering: false,
        message: "",
        stack: "",
        componentStack: "",
        detailsOpen: false,
      });
      return;
    }
    window.location.reload();
  };

  handleHome = () => {
    // Electron file:// must not navigate to "/" (blank white screen).
    if (typeof window !== "undefined" && window.electronAPI?.isElectron && window.location.protocol === "file:") {
      window.location.hash = "#/";
      window.location.reload();
      return;
    }
    window.location.href = "/";
  };

  render() {
    if (this.state.recovering && !this.state.hasError) {
      return <RouteLoadingScreen label={t("Loading")} />;
    }

    if (!this.state.hasError) return this.props.children;

    const showDetails = canSeeErrorDetails({
      dev: import.meta.env.DEV,
      admin: Boolean(this.state.userData?.isAdmin),
    });
    const detailText = [this.state.message, this.state.stack, this.state.componentStack].filter(Boolean).join("\n\n");
    const pane = this.props.scope === "pane";

    return (
      <main className={pane ? "crash-screen crash-pane" : "crash-screen"}>
        <section className="crash-card" role="alert">
          <p className="crash-kicker">Descall</p>
          <h1>{t("Something went wrong")}</h1>
          <p>{t("The page ran into a problem. You can try again, or go back home.")}</p>
          {this.state.supportCode ? (
            <p className="crash-code">
              {t("Error code")}
              <code>{this.state.supportCode}</code>
            </p>
          ) : null}
          <div className="crash-actions">
            <button type="button" className="crash-primary" onClick={this.handleRetry}>
              <IconRefresh size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
              {t("Try again now")}
            </button>
            <button type="button" className="crash-secondary" onClick={this.handleHome}>
              <IconHome size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
              {t("Home")}
            </button>
          </div>
          {showDetails ? (
            <>
              <button
                type="button"
                className="crash-details-toggle"
                aria-expanded={this.state.detailsOpen}
                onClick={() => this.setState((state) => ({ detailsOpen: !state.detailsOpen }))}
              >
                {this.state.detailsOpen ? t("Hide error details") : t("Show error details")}
              </button>
              {this.state.detailsOpen && detailText ? <pre className="crash-details">{detailText}</pre> : null}
            </>
          ) : null}
        </section>
      </main>
    );
  }
}
