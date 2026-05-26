import { useState, useCallback, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Instagram, ArrowLeft, Wifi, Cloud, Database,
  CheckCircle2, XCircle, Loader2, RefreshCw,
  User, Clock, Code, Zap, Shield, Hash, ChevronDown,
  Eye, EyeOff, Pencil, Save, X, Key, Timer, AlertCircle,
} from "lucide-react";
import axios from "axios";
import { toast } from "sonner";

// ---------- helpers ----------

const timeAgo = (iso) => {
  if (!iso) return null;
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

const formatRemaining = (seconds) => {
  if (seconds <= 0) return "expired";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${h}h ${mm}m`;
  }
  if (m >= 1) return `${m}m ${s}s`;
  return `${s}s`;
};

// ---------- Validity Pill (countdown) ----------

function ValidityPill({ validUntil, validityMinutes, connected }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!validUntil || connected !== true) return null;
  const remainingMs = new Date(validUntil).getTime() - now;
  const remainingSec = Math.max(0, Math.floor(remainingMs / 1000));
  const totalSec = (validityMinutes || 60) * 60;
  const pct = Math.max(0, Math.min(100, (remainingSec / totalSec) * 100));
  const expired = remainingSec === 0;

  let toneText = "text-emerald-700";
  let toneBg = "bg-emerald-50 border-emerald-200";
  let toneBar = "bg-emerald-500";
  if (pct < 30) { toneText = "text-amber-700"; toneBg = "bg-amber-50 border-amber-200"; toneBar = "bg-amber-500"; }
  if (expired) { toneText = "text-red-700"; toneBg = "bg-red-50 border-red-200"; toneBar = "bg-red-500"; }

  return (
    <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-md border text-xs ${toneBg} ${toneText}`} data-testid="validity-pill">
      <Timer className="w-3 h-3" />
      <span className="font-medium">
        {expired ? "Re-verify needed" : `Valid for ${formatRemaining(remainingSec)}`}
      </span>
      <div className="w-12 h-1 bg-white/60 rounded-full overflow-hidden">
        <div className={`h-full ${toneBar} transition-all duration-1000`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ---------- Credential Row ----------

function CredentialRow({ cred, onSave, onReset }) {
  const [editing, setEditing] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [newValue, setNewValue] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!newValue.trim()) { toast.error("Value cannot be empty"); return; }
    setSaving(true);
    try {
      await onSave(cred.key, newValue.trim());
      setEditing(false);
      setNewValue("");
      setRevealed(false);
    } catch {
      // toast handled by parent
    } finally { setSaving(false); }
  };

  return (
    <div className="flex items-center justify-between gap-3 py-2 px-3 rounded-md bg-white border border-slate-100 hover:border-slate-200 transition-colors" data-testid={`cred-row-${cred.key}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Key className="w-3 h-3 text-slate-400" />
          <span className="text-xs font-medium text-slate-700">{cred.label}</span>
          <Badge variant="outline" className="text-[10px] h-4 px-1 border-slate-200 text-slate-500">
            {cred.source === "database" ? "override" : cred.source}
          </Badge>
        </div>
        {editing ? (
          <div className="flex items-center gap-2 mt-1.5">
            <Input
              type={revealed ? "text" : "password"}
              autoFocus
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder={`Enter new ${cred.label.toLowerCase()}`}
              className="h-7 text-xs font-mono"
              data-testid={`cred-input-${cred.key}`}
            />
            <Button
              variant="ghost" size="sm"
              onClick={() => setRevealed((v) => !v)}
              className="h-7 w-7 p-0"
              data-testid={`cred-toggle-reveal-${cred.key}`}
            >
              {revealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-slate-500 font-mono mt-0.5" data-testid={`cred-masked-${cred.key}`}>
            {cred.has_value ? cred.masked_value : <span className="italic text-slate-400">not set</span>}
          </p>
        )}
        {cred.updated_at && !editing && (
          <p className="text-[10px] text-slate-400 mt-0.5">
            Updated by {cred.updated_by} · {timeAgo(cred.updated_at)}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {editing ? (
          <>
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white h-7 px-2"
              onClick={handleSave}
              disabled={saving}
              data-testid={`cred-save-${cred.key}`}
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            </Button>
            <Button
              variant="ghost" size="sm"
              onClick={() => { setEditing(false); setNewValue(""); setRevealed(false); }}
              className="h-7 w-7 p-0"
              data-testid={`cred-cancel-${cred.key}`}
            >
              <X className="w-3 h-3" />
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="ghost" size="sm"
              onClick={() => setEditing(true)}
              className="h-7 px-2 text-xs"
              data-testid={`cred-edit-${cred.key}`}
            >
              <Pencil className="w-3 h-3 mr-1" />Edit
            </Button>
            {cred.source === "database" && (
              <Button
                variant="ghost" size="sm"
                onClick={() => onReset(cred.key)}
                className="h-7 px-2 text-xs text-slate-500 hover:text-red-600"
                data-testid={`cred-reset-${cred.key}`}
                title="Remove DB override, fall back to .env"
              >
                Reset
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------- Connection Card ----------

function ConnectionCard({
  title, icon: Icon, status, checkedAt, validUntil, validityMinutes,
  isChecking, onCheck, credentials, onSaveCredential, onResetCredential, children,
}) {
  const [open, setOpen] = useState(false);
  const ago = timeAgo(checkedAt);
  const isStale = checkedAt && validUntil
    ? Date.now() > new Date(validUntil).getTime()
    : false;
  const slug = title.toLowerCase().replace(/\s/g, "-");

  return (
    <Card
      className={`border-2 transition-colors ${status === true ? "border-green-200" : status === false ? "border-red-200" : "border-slate-200"}`}
      data-testid={`connection-${slug}`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${status === true ? "bg-green-100" : status === false ? "bg-red-100" : "bg-slate-100"}`}>
              <Icon className={`w-4 h-4 ${status === true ? "text-green-600" : status === false ? "text-red-600" : "text-slate-500"}`} />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">{title}</CardTitle>
              {checkedAt && (
                <div className="flex items-center gap-1 mt-0.5">
                  <Clock className={`w-3 h-3 ${isStale ? "text-amber-500" : "text-green-500"}`} />
                  <span className={`text-xs ${isStale ? "text-amber-600" : "text-green-600"}`}>
                    Verified {ago}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <ValidityPill validUntil={validUntil} validityMinutes={validityMinutes} connected={status} />
            {status === true && <Badge className="bg-green-100 text-green-700 text-xs"><CheckCircle2 className="w-3 h-3 mr-1" />Connected</Badge>}
            {status === false && <Badge className="bg-red-100 text-red-700 text-xs"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>}
            {status === null && <Badge variant="outline" className="text-slate-500 text-xs">Not checked</Badge>}
            <Button
              variant="ghost" size="sm" onClick={onCheck} disabled={isChecking}
              className="h-7 px-2" data-testid={`check-${slug}`}
            >
              {isChecking ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {children}
        {credentials && credentials.length > 0 && (
          <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger asChild>
              <Button
                variant="outline" size="sm"
                className="w-full justify-between h-8 text-xs border-slate-200 bg-slate-50/50"
                data-testid={`toggle-creds-${slug}`}
              >
                <span className="flex items-center gap-1.5">
                  <Key className="w-3 h-3 text-slate-500" />
                  Manage credentials ({credentials.length})
                </span>
                <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2 space-y-1.5">
              {credentials.map((c) => (
                <CredentialRow
                  key={c.key}
                  cred={c}
                  onSave={onSaveCredential}
                  onReset={onResetCredential}
                />
              ))}
              <p className="text-[10px] text-slate-400 px-1 flex items-start gap-1 mt-1">
                <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                Saving a new value is verified against the live API before being stored (encrypted) in the database. The change takes effect immediately and survives restarts.
              </p>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Read-only MongoDB credential view ----------

function MongoCredentialView({ mongoUrl, dbName }) {
  const [revealed, setRevealed] = useState(false);
  const mask = (url) => {
    if (!url) return "not set";
    // mask password in URI like mongodb://user:pass@host
    return url.replace(/(:\/\/[^:]+:)([^@]+)(@)/, "$1••••••••$3");
  };
  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button variant="outline" size="sm" className="w-full justify-between h-8 text-xs border-slate-200 bg-slate-50/50" data-testid="toggle-creds-mongodb">
          <span className="flex items-center gap-1.5">
            <Key className="w-3 h-3 text-slate-500" />
            View connection (read-only)
          </span>
          <ChevronDown className="w-3 h-3" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2 space-y-1.5">
        <div className="flex items-center justify-between gap-2 py-2 px-3 rounded-md bg-white border border-slate-100">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Key className="w-3 h-3 text-slate-400" />
              <span className="text-xs font-medium text-slate-700">MONGO_URL</span>
              <Badge variant="outline" className="text-[10px] h-4 px-1 border-slate-200 text-slate-500">env</Badge>
            </div>
            <p className="text-xs text-slate-500 font-mono mt-0.5 truncate" data-testid="mongo-url-display">
              {revealed ? (mongoUrl || "not set") : mask(mongoUrl)}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">DB: <span className="font-mono">{dbName || "—"}</span></p>
          </div>
          <Button
            variant="ghost" size="sm" onClick={() => setRevealed((v) => !v)}
            className="h-7 w-7 p-0" data-testid="toggle-mongo-reveal"
          >
            {revealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          </Button>
        </div>
        <p className="text-[10px] text-slate-400 px-1 flex items-start gap-1 mt-1">
          <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
          MongoDB connection is managed via .env and cannot be changed at runtime to avoid disconnecting the running app.
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ---------- Main Page ----------

function InfoRow({ label, value, mono }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`text-xs text-slate-800 font-medium ${mono ? "font-mono" : ""}`}>{value || "N/A"}</span>
    </div>
  );
}

export default function SettingsPage({ token, userEmail, backendUrl }) {
  const navigate = useNavigate();
  const [buildInfo, setBuildInfo] = useState(null);
  const [loadingBuild, setLoadingBuild] = useState(true);

  const [apifyStatus, setApifyStatus] = useState(null);
  const [checkingApify, setCheckingApify] = useState(false);

  const [cloudinaryStatus, setCloudinaryStatus] = useState(null);
  const [checkingCloudinary, setCheckingCloudinary] = useState(false);

  const [mongoStatus, setMongoStatus] = useState(null);
  const [checkingMongo, setCheckingMongo] = useState(false);

  const [credentials, setCredentials] = useState([]);
  const [healthSummary, setHealthSummary] = useState({});

  const api = useMemo(() => axios.create({
    baseURL: `${backendUrl}/api`,
    headers: { Authorization: `Bearer ${token}` },
  }), [backendUrl, token]);

  // --- fetchers ---

  const fetchBuildInfo = useCallback(async () => {
    setLoadingBuild(true);
    try {
      const response = await api.get("/settings/build-info");
      setBuildInfo(response.data);
    } catch { toast.error("Failed to load build info"); }
    finally { setLoadingBuild(false); }
  }, [api]);

  const fetchCredentials = useCallback(async () => {
    try {
      const response = await api.get("/settings/credentials");
      setCredentials(response.data.credentials || []);
    } catch { /* silent */ }
  }, [api]);

  const fetchHealthSummary = useCallback(async () => {
    try {
      const response = await api.get("/settings/health-status");
      setHealthSummary(response.data || {});
      // Hydrate per-service status from last health record (validity TTL persists across refresh)
      const a = response.data?.apify;
      if (a?.checked_at) {
        setApifyStatus((prev) => ({
          ...(prev || {}),
          connected: !!a.connected,
          checked_at: a.checked_at,
          valid_until: a.valid_until,
          validity_minutes: a.validity_minutes,
        }));
      }
      const c = response.data?.cloudinary;
      if (c?.checked_at) {
        setCloudinaryStatus((prev) => ({
          ...(prev || {}),
          connected: !!c.connected,
          checked_at: c.checked_at,
          valid_until: c.valid_until,
          validity_minutes: c.validity_minutes,
        }));
      }
      const m = response.data?.mongodb;
      if (m?.checked_at) {
        setMongoStatus((prev) => ({
          ...(prev || {}),
          connected: !!m.connected,
          checked_at: m.checked_at,
          valid_until: m.valid_until,
          validity_minutes: m.validity_minutes,
        }));
      }
    } catch { /* silent */ }
  }, [api]);

  useEffect(() => {
    fetchBuildInfo();
    fetchCredentials();
    fetchHealthSummary();
  }, [fetchBuildInfo, fetchCredentials, fetchHealthSummary]);

  // --- checks ---

  const checkApify = useCallback(async () => {
    setCheckingApify(true);
    try {
      const response = await api.get("/apify/status");
      setApifyStatus(response.data);
      toast[response.data.connected ? "success" : "error"](
        response.data.connected ? "Apify connections verified" : "Apify connection issues"
      );
    } catch { toast.error("Failed to check Apify"); setApifyStatus({ connected: false }); }
    finally { setCheckingApify(false); }
  }, [api]);

  const checkCloudinary = useCallback(async () => {
    setCheckingCloudinary(true);
    try {
      const response = await api.get("/settings/check-cloudinary");
      setCloudinaryStatus(response.data);
      toast[response.data.connected ? "success" : "error"](
        response.data.connected ? "Cloudinary connected" : "Cloudinary connection failed"
      );
    } catch { toast.error("Failed to check Cloudinary"); setCloudinaryStatus({ connected: false }); }
    finally { setCheckingCloudinary(false); }
  }, [api]);

  const checkMongo = useCallback(async () => {
    setCheckingMongo(true);
    try {
      const response = await api.get("/settings/check-mongodb");
      setMongoStatus(response.data);
      toast[response.data.connected ? "success" : "error"](
        response.data.connected ? "MongoDB connected" : "MongoDB connection failed"
      );
    } catch { toast.error("Failed to check MongoDB"); setMongoStatus({ connected: false }); }
    finally { setCheckingMongo(false); }
  }, [api]);

  const checkAll = useCallback(async () => {
    await Promise.all([checkApify(), checkCloudinary(), checkMongo()]);
  }, [checkApify, checkCloudinary, checkMongo]);

  // --- credential save/reset ---

  const handleSaveCredential = useCallback(async (key, value) => {
    try {
      await api.put("/settings/credentials", { key, value });
      toast.success("Credential verified & saved");
      await fetchCredentials();
      // Auto re-check the related service
      const svc = credentials.find((c) => c.key === key)?.service;
      if (svc === "apify") checkApify();
      if (svc === "cloudinary") checkCloudinary();
    } catch (err) {
      const detail = err.response?.data?.detail || "Failed to save credential";
      toast.error(detail);
      throw err;
    }
  }, [api, fetchCredentials, credentials, checkApify, checkCloudinary]);

  const handleResetCredential = useCallback(async (key) => {
    try {
      await api.delete(`/settings/credentials/${key}`);
      toast.success("Override removed — using .env value");
      await fetchCredentials();
    } catch {
      toast.error("Failed to reset credential");
    }
  }, [api, fetchCredentials]);

  // --- credential lists per service ---

  const apifyCreds = useMemo(
    () => credentials.filter((c) => c.service === "apify"),
    [credentials]
  );
  const cloudinaryCreds = useMemo(
    () => credentials.filter((c) => c.service === "cloudinary"),
    [credentials]
  );

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-50 glass border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <Instagram className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Settings</h1>
              <p className="text-xs text-slate-500">Connections & Configuration</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-slate-600 border-slate-200">
              <User className="w-3 h-3 mr-1" />{userEmail}
            </Badge>
            <Button
              variant="outline" size="sm" onClick={() => navigate("/")}
              className="border-slate-200" data-testid="back-to-dashboard"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />Dashboard
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Verify All Banner */}
        <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Service Connections</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Verify connections, view & update credentials. Each verified check stays valid for the shown window.
            </p>
          </div>
          <Button
            onClick={checkAll}
            disabled={checkingApify || checkingCloudinary || checkingMongo}
            className="bg-blue-600 hover:bg-blue-700 text-white"
            data-testid="verify-all-btn"
          >
            {(checkingApify || checkingCloudinary || checkingMongo)
              ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              : <Shield className="w-4 h-4 mr-2" />}
            Verify All Connections
          </Button>
        </div>

        {/* Connection Cards */}
        <div className="grid gap-4">
          {/* Apify */}
          <ConnectionCard
            title="Apify" icon={Wifi}
            status={apifyStatus ? apifyStatus.connected : null}
            checkedAt={apifyStatus?.checked_at}
            validUntil={apifyStatus?.valid_until}
            validityMinutes={apifyStatus?.validity_minutes}
            isChecking={checkingApify}
            onCheck={checkApify}
            credentials={apifyCreds}
            onSaveCredential={handleSaveCredential}
            onResetCredential={handleResetCredential}
          >
            {apifyStatus && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className={`p-2.5 rounded-lg border ${apifyStatus.hashtag_token_valid ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                    <div className="flex items-center gap-1.5">
                      <Hash className={`w-3 h-3 ${apifyStatus.hashtag_token_valid ? "text-green-600" : "text-red-600"}`} />
                      <span className="text-xs font-medium">Hashtag Token</span>
                    </div>
                    <p className={`text-xs mt-0.5 ${apifyStatus.hashtag_token_valid ? "text-green-600" : "text-red-600"}`}>
                      {apifyStatus.hashtag_token_valid ? "Valid" : "Invalid"}
                    </p>
                  </div>
                  <div className={`p-2.5 rounded-lg border ${apifyStatus.username_token_valid ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                    <div className="flex items-center gap-1.5">
                      <User className={`w-3 h-3 ${apifyStatus.username_token_valid ? "text-green-600" : "text-red-600"}`} />
                      <span className="text-xs font-medium">Username Token</span>
                    </div>
                    <p className={`text-xs mt-0.5 ${apifyStatus.username_token_valid ? "text-green-600" : "text-red-600"}`}>
                      {apifyStatus.username_token_valid ? "Valid" : "Invalid"}
                    </p>
                  </div>
                </div>
                <div className="space-y-1">
                  {[
                    { label: "Profile Scraper", ok: apifyStatus.username_actor_accessible, id: "xMc5Ga1oCONPmWJIa" },
                    { label: "Reel Scraper", ok: apifyStatus.reel_scraper_accessible, id: "apify~instagram-reel-scraper" },
                    { label: "Hashtag Scraper", ok: apifyStatus.hashtag_actor_accessible, id: "reGe1ST3OBgYZSsZJ" },
                  ].map(actor => (
                    <div key={actor.id} className="flex items-center justify-between py-1">
                      <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${actor.ok ? "bg-green-500" : "bg-red-500"}`} />
                        <span className="text-xs text-slate-700">{actor.label}</span>
                        <span className="text-xs text-slate-400 font-mono">{actor.id}</span>
                      </div>
                      <span className={`text-xs font-medium ${actor.ok ? "text-green-600" : "text-red-600"}`}>
                        {actor.ok ? "Active" : "Inactive"}
                      </span>
                    </div>
                  ))}
                </div>
                {apifyStatus.account_info && (
                  <div className="text-xs text-slate-500 pt-2 border-t border-slate-100">
                    Account: <span className="font-medium text-slate-700">{apifyStatus.account_info.username}</span>
                    {" "}/ Plan: <span className="font-medium text-slate-700">{apifyStatus.account_info.plan}</span>
                  </div>
                )}
                {apifyStatus.errors?.length > 0 && (
                  <div className="p-2 bg-red-50 rounded text-xs text-red-700 space-y-0.5">
                    {apifyStatus.errors.map((err) => <p key={err}>{err}</p>)}
                  </div>
                )}
              </div>
            )}
          </ConnectionCard>

          {/* Cloudinary */}
          <ConnectionCard
            title="Cloudinary" icon={Cloud}
            status={cloudinaryStatus ? cloudinaryStatus.connected : null}
            checkedAt={cloudinaryStatus?.checked_at}
            validUntil={cloudinaryStatus?.valid_until}
            validityMinutes={cloudinaryStatus?.validity_minutes}
            isChecking={checkingCloudinary}
            onCheck={checkCloudinary}
            credentials={cloudinaryCreds}
            onSaveCredential={handleSaveCredential}
            onResetCredential={handleResetCredential}
          >
            {cloudinaryStatus && (
              <div className="space-y-1">
                <InfoRow label="Cloud Name" value={cloudinaryStatus.cloud_name} mono />
                <InfoRow label="API Key" value={cloudinaryStatus.api_key_hint} mono />
                <InfoRow label="Upload Folder" value="Content for Vibe Check" />
                <InfoRow label="Optimization" value="f_auto / q_auto / vc_auto" mono />
                {cloudinaryStatus.error && (
                  <div className="p-2 bg-red-50 rounded text-xs text-red-700 mt-2">{cloudinaryStatus.error}</div>
                )}
              </div>
            )}
          </ConnectionCard>

          {/* MongoDB (read-only credentials) */}
          <ConnectionCard
            title="MongoDB" icon={Database}
            status={mongoStatus ? mongoStatus.connected : null}
            checkedAt={mongoStatus?.checked_at}
            validUntil={mongoStatus?.valid_until}
            validityMinutes={mongoStatus?.validity_minutes}
            isChecking={checkingMongo}
            onCheck={checkMongo}
          >
            {mongoStatus && mongoStatus.connected && (
              <div className="space-y-1">
                <InfoRow label="Database" value={mongoStatus.database} mono />
                {mongoStatus.collections && Object.entries(mongoStatus.collections).map(([col, count]) => (
                  <InfoRow key={col} label={col} value={`${count} docs`} mono />
                ))}
              </div>
            )}
            {mongoStatus && mongoStatus.error && (
              <div className="p-2 bg-red-50 rounded text-xs text-red-700">{mongoStatus.error}</div>
            )}
            <MongoCredentialView mongoUrl={buildInfo?.mongo_url_display} dbName={mongoStatus?.database || buildInfo?.database} />
          </ConnectionCard>
        </div>

        {/* Build & Configuration Info */}
        <Card className="border-slate-200" data-testid="build-info-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Code className="w-5 h-5 text-blue-600" />Build & Configuration
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingBuild ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-blue-600" /></div>
            ) : buildInfo ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-slate-50 rounded-lg border border-blue-100">
                  <div>
                    <p className="text-lg font-bold text-slate-900">{buildInfo.app_name}</p>
                    <p className="text-sm text-slate-500">Internal Tool for My Date Jar</p>
                  </div>
                  <div className="text-right">
                    <Badge className="bg-blue-600 text-white text-sm px-3 py-1">v{buildInfo.version}</Badge>
                    <p className="text-xs text-slate-500 mt-1">Built {buildInfo.build_date}</p>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <Label className="text-xs text-slate-500 uppercase tracking-wide mb-3 block">Tech Stack</Label>
                    <div className="space-y-1 bg-slate-50 rounded-lg p-3">
                      <InfoRow label="Backend" value={`${buildInfo.framework} (Python ${buildInfo.python_version})`} />
                      <InfoRow label="Frontend" value={buildInfo.frontend} />
                      <InfoRow label="Database" value={buildInfo.database} />
                      <InfoRow label="Environment" value={buildInfo.environment} />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500 uppercase tracking-wide mb-3 block">Apify Actors</Label>
                    <div className="space-y-1 bg-slate-50 rounded-lg p-3">
                      {buildInfo.integrations?.apify?.actors && Object.entries(buildInfo.integrations.apify.actors).map(([key, actor]) => (
                        <InfoRow key={key} label={actor.name} value={actor.id} mono />
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-slate-500 uppercase tracking-wide mb-3 block">Active Features</Label>
                  <div className="flex flex-wrap gap-2">
                    {buildInfo.features?.map(feature => (
                      <Badge key={feature} variant="outline" className="text-xs bg-white border-slate-200">
                        <Zap className="w-3 h-3 mr-1 text-blue-500" />{feature}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500 text-center py-8">Failed to load build info.</p>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
