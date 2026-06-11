/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Key, Save, Eye, EyeOff, Loader2, Calendar, AlertTriangle, RotateCcw,
  Zap, CheckCircle2, XCircle,
} from "lucide-react";
import { toast } from "sonner";

const timeAgo = (iso) => {
  if (!iso) return null;
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

const REVEAL_AUTO_HIDE_MS = 15000;

function daysUntil(iso) {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.ceil((target - today.getTime()) / (1000 * 60 * 60 * 24));
}

function ExpiryBadge({ expiresAt }) {
  if (!expiresAt) return null;
  const days = daysUntil(expiresAt);
  const date = new Date(expiresAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  if (days < 0) {
    return (
      <Badge className="text-[10px] h-5 px-1.5 bg-red-100 text-red-700 border-red-300" data-testid="expiry-badge">
        <AlertTriangle className="w-3 h-3 mr-1" />Expired · {date}
      </Badge>
    );
  }
  if (days <= 7) {
    return (
      <Badge className="text-[10px] h-5 px-1.5 bg-red-100 text-red-700 border-red-300" data-testid="expiry-badge">
        <AlertTriangle className="w-3 h-3 mr-1" />Expires in {days} day{days === 1 ? "" : "s"}
      </Badge>
    );
  }
  if (days <= 30) {
    return (
      <Badge className="text-[10px] h-5 px-1.5 bg-amber-100 text-amber-700 border-amber-300" data-testid="expiry-badge">
        <Calendar className="w-3 h-3 mr-1" />Expires in {days} days
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] h-5 px-1.5 text-slate-600" data-testid="expiry-badge">
      <Calendar className="w-3 h-3 mr-1" />Expires in {days} days · {date}
    </Badge>
  );
}

export function CredentialRow({ cred, onSave, onReset, onReveal, onTest }) {
  const [newValue, setNewValue] = useState("");
  const [showNewValue, setShowNewValue] = useState(false);
  const [expiresAt, setExpiresAt] = useState(cred.expires_at ? cred.expires_at.slice(0, 10) : "");
  const [saving, setSaving] = useState(false);

  const [revealedValue, setRevealedValue] = useState(null);
  const [revealing, setRevealing] = useState(false);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // Sync expiry when cred refreshes from server
  useEffect(() => {
    setExpiresAt(cred.expires_at ? cred.expires_at.slice(0, 10) : "");
  }, [cred.expires_at]);

  // Auto-hide reveal (deferred state update via setTimeout — not a direct effect-body setState)
  useEffect(() => {
    if (revealedValue == null) return undefined;
    const t = setTimeout(() => setRevealedValue(null), REVEAL_AUTO_HIDE_MS);
    return () => clearTimeout(t);
  }, [revealedValue]);

  const handleReveal = async () => {
    if (revealedValue != null) { setRevealedValue(null); return; }
    setRevealing(true);
    try {
      const value = await onReveal(cred.key);
      setRevealedValue(value || "");
    } catch {
      toast.error("Failed to reveal credential");
    } finally { setRevealing(false); }
  };

  const handleSave = async () => {
    if (!newValue.trim()) { toast.error("Please paste a value to save"); return; }
    setSaving(true);
    try {
      const payload = { expires_at: cred.supports_expiry ? (expiresAt || "") : null };
      await onSave(cred.key, newValue.trim(), payload);
      setNewValue("");
      setShowNewValue(false);
      setRevealedValue(null);
      setTestResult(null);
    } catch {
      /* parent toast */
    } finally { setSaving(false); }
  };

  const handleTest = async () => {
    if (!onTest) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await onTest(cred.key);
      setTestResult(result);
      if (result?.ok) toast.success(`${cred.label} is valid`);
      else toast.error(`${cred.label} failed: ${result?.error || "unknown error"}`);
    } catch (err) {
      const errMsg = err?.response?.data?.error || err?.message || "Test failed";
      setTestResult({ ok: false, error: errMsg });
      toast.error(errMsg);
    } finally { setTesting(false); }
  };

  const initialExpiry = cred.expires_at ? cred.expires_at.slice(0, 10) : "";
  const expiryChanged = cred.supports_expiry && expiresAt !== initialExpiry;
  const canSave = newValue.trim().length > 0 || expiryChanged;

  return (
    <div
      className="p-3 rounded-lg bg-white border border-slate-200 hover:border-slate-300 transition-colors space-y-2.5"
      data-testid={`cred-row-${cred.key}`}
    >
      {/* Header — label + status badges */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <Key className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="text-sm font-semibold text-slate-800">{cred.label}</span>
          <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-slate-200 text-slate-500">
            {cred.source === "database" ? "saved override" : cred.source === "env" ? "from .env" : "not set"}
          </Badge>
          {cred.supports_expiry && <ExpiryBadge expiresAt={cred.expires_at} />}
        </div>
        {cred.source === "database" && (
          <Button
            variant="ghost" size="sm" onClick={() => onReset(cred.key)}
            className="h-7 px-2 text-[11px] text-slate-500 hover:text-red-600"
            data-testid={`cred-reset-${cred.key}`}
            title="Remove DB override, fall back to .env value"
          >
            <RotateCcw className="w-3 h-3 mr-1" />Reset
          </Button>
        )}
      </div>

      {/* Current value display + reveal */}
      <div className="flex items-center gap-2 px-2.5 py-2 rounded bg-slate-50 border border-slate-100">
        <span className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold shrink-0">Current</span>
        <code
          className="flex-1 text-xs text-slate-700 font-mono break-all select-all"
          data-testid={`cred-current-${cred.key}`}
        >
          {cred.has_value
            ? (revealedValue != null ? revealedValue : cred.masked_value)
            : <span className="italic text-slate-400 not-italic">not set</span>}
        </code>
        {cred.has_value && (
          <Button
            variant="ghost" size="sm" onClick={handleReveal}
            disabled={revealing}
            className="h-6 w-6 p-0 text-slate-500 hover:text-blue-600 shrink-0"
            data-testid={`cred-view-reveal-${cred.key}`}
            title={revealedValue != null ? "Hide" : "Reveal current value (auto-hides in 15s)"}
          >
            {revealing
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : (revealedValue != null ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />)}
          </Button>
        )}
      </div>
      {revealedValue != null && (
        <p className="text-[10px] text-amber-600 -mt-1 ml-1">Revealed · auto-hides in 15s · access is audit-logged</p>
      )}

      {/* Always-visible new value input + (optional) expiry + Save */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Input
            type={showNewValue ? "text" : "password"}
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder={cred.has_value ? `Paste new ${cred.label.toLowerCase()} to replace…` : `Paste ${cred.label.toLowerCase()} here…`}
            className="h-9 text-xs font-mono"
            data-testid={`cred-input-${cred.key}`}
            onKeyDown={(e) => { if (e.key === "Enter" && canSave && !saving) handleSave(); }}
          />
          <Button
            variant="outline" size="sm" onClick={() => setShowNewValue((v) => !v)}
            className="h-9 w-9 p-0 border-slate-200 shrink-0"
            data-testid={`cred-toggle-show-${cred.key}`}
            title={showNewValue ? "Hide input" : "Show input"}
          >
            {showNewValue ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </Button>
        </div>

        <div className="flex items-end justify-between gap-2 flex-wrap">
          {cred.supports_expiry ? (
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <div>
                <label className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold block">
                  Token expires on <span className="font-normal text-slate-400 normal-case">(optional)</span>
                </label>
                <Input
                  type="date" value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="h-8 text-xs w-44 mt-0.5"
                  data-testid={`cred-expiry-${cred.key}`}
                  title="Set the date this token expires (as configured in Apify Console)"
                />
              </div>
              {expiresAt && (
                <Button
                  variant="ghost" size="sm" onClick={() => setExpiresAt("")}
                  className="h-6 px-1.5 text-[10px] text-slate-500 hover:text-slate-700 self-end mb-1"
                  data-testid={`cred-clear-expiry-${cred.key}`}
                  title="Clear expiry"
                >
                  Clear
                </Button>
              )}
            </div>
          ) : <div />}

          <div className="flex items-center gap-2 shrink-0">
            {cred.has_value && onTest && (
              <Button
                variant="outline" size="sm"
                onClick={handleTest}
                disabled={testing}
                className="h-9 px-3 border-slate-300 text-slate-700 hover:bg-slate-50"
                data-testid={`cred-test-${cred.key}`}
                title="Run a live validity check against the upstream API"
              >
                {testing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 mr-1.5 text-amber-500" />}
                Test now
              </Button>
            )}
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white h-9 px-4"
              onClick={handleSave}
              disabled={saving || !canSave}
              data-testid={`cred-save-${cred.key}`}
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-2" />}
              Save{newValue.trim() ? " & verify" : ""}
            </Button>
          </div>
        </div>
      </div>

      {/* Footer — last updated + Test result */}
      {cred.updated_at && (
        <p className="text-[10px] text-slate-400">
          Last updated by {cred.updated_by || "—"} · {timeAgo(cred.updated_at)}
        </p>
      )}

      {/* "Used by" mapping — which Apify actors / SDKs consume this credential */}
      {Array.isArray(cred.used_by) && cred.used_by.length > 0 && (
        <div className="pt-1.5 border-t border-slate-100">
          <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1.5 flex items-center gap-1">
            <Zap className="w-3 h-3 text-amber-500" />Used by
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {cred.used_by.map((u) => (
              <span
                key={u.name + u.actor}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] text-slate-700"
                title={`Actor ID: ${u.actor} · Used in: ${(u.search_modes || []).join(", ")}`}
                data-testid={`cred-used-by-${cred.key}-${u.name.replace(/\s+/g, "-").toLowerCase()}`}
              >
                <span className="font-semibold">{u.name}</span>
                {(u.search_modes || []).length > 0 && (
                  <span className="text-slate-400">· {u.search_modes.join(" / ")}</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Test result */}
      {testResult && (
        <div
          className={`flex items-start gap-2 p-2 rounded-md text-xs ${
            testResult.ok ? "bg-emerald-50 border border-emerald-200 text-emerald-800" : "bg-red-50 border border-red-200 text-red-800"
          }`}
          data-testid={`cred-test-result-${cred.key}`}
        >
          {testResult.ok ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
          <div className="min-w-0">
            {testResult.ok ? (
              <p className="font-semibold">Verified — credential is currently valid</p>
            ) : (
              <p className="font-semibold break-all">Failed: {testResult.error || "Unknown error"}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
