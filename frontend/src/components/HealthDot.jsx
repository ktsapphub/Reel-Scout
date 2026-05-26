import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Activity } from "lucide-react";

const POLL_INTERVAL_MS = 60_000;

/**
 * Small status dot for the app header.
 * Polls /api/settings/health-status every 60s and shows a single dot:
 *  - green: all services connected and within validity window
 *  - amber: at least one stale or not yet checked
 *  - red: at least one failed
 *  - slate (idle): no data yet
 * Click navigates to /settings.
 */
export function HealthDot({ token, backendUrl }) {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);

  const api = useMemo(() => axios.create({
    baseURL: `${backendUrl}/api`,
    headers: { Authorization: `Bearer ${token}` },
  }), [backendUrl, token]);

  const fetchHealth = useCallback(async () => {
    try {
      const response = await api.get("/settings/health-status");
      setSummary(response.data);
    } catch { /* silent */ }
  }, [api]);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  const { tone, label, services } = useMemo(() => computeStatus(summary), [summary]);

  return (
    <button
      type="button"
      onClick={() => navigate("/settings")}
      className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md border border-slate-200 hover:bg-slate-50 transition-colors group"
      data-testid="health-dot"
      title={`${label} — click for details`}
    >
      <span className="relative inline-flex">
        <span className={`w-2 h-2 rounded-full ${DOT_BG[tone]}`} />
        {tone === "green" && (
          <span className={`absolute inset-0 w-2 h-2 rounded-full ${DOT_BG[tone]} opacity-60 animate-ping`} />
        )}
      </span>
      <Activity className={`w-3.5 h-3.5 ${TEXT[tone]} group-hover:text-blue-600 transition-colors`} />
      <span className={`text-xs font-medium ${TEXT[tone]}`}>{label}</span>
      <span className="text-[10px] text-slate-400 hidden md:inline">
        {services.map(s => `${s.name}:${s.indicator}`).join(" · ")}
      </span>
    </button>
  );
}

const DOT_BG = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  slate: "bg-slate-300",
};

const TEXT = {
  green: "text-emerald-700",
  amber: "text-amber-700",
  red: "text-red-700",
  slate: "text-slate-500",
};

function computeStatus(summary) {
  if (!summary) {
    return { tone: "slate", label: "Checking…", services: [] };
  }
  const services = ["apify", "cloudinary", "mongodb"].map(name => {
    const s = summary[name];
    if (!s || s.connected == null) return { name, indicator: "?", state: "unknown" };
    if (s.connected === false) return { name, indicator: "✕", state: "failed" };
    if (s.is_stale) return { name, indicator: "!", state: "stale" };
    return { name, indicator: "✓", state: "ok" };
  });
  if (services.some(s => s.state === "failed")) {
    return { tone: "red", label: "Connection failed", services };
  }
  if (services.some(s => s.state === "stale" || s.state === "unknown")) {
    return { tone: "amber", label: "Re-verify needed", services };
  }
  return { tone: "green", label: "All systems go", services };
}
