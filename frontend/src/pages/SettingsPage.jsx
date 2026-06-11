import { useState, useCallback, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Instagram, ArrowLeft, Wifi, Cloud, Database,
  Loader2, User, Code, Zap, Shield, Hash,
  CheckCircle2, XCircle, MinusCircle, KeyRound, X,
  RefreshCw,
} from "lucide-react";
import axios from "axios";
import { toast } from "sonner";

import { ConnectionCard } from "@/components/settings/ConnectionCard";
import { MongoCredentialView } from "@/components/settings/MongoCredentialView";
import { ApifyConnectionGuide } from "@/components/settings/ApifyConnectionGuide";
import { ErrorResolutionPanel } from "@/components/settings/ErrorResolutionPanel";

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
  const [loadingCreds, setLoadingCreds] = useState(true);
  const [credsError, setCredsError] = useState(null);
  const [healthSummary, setHealthSummary] = useState({});

  const [testingAll, setTestingAll] = useState(false);
  const [testAllResults, setTestAllResults] = useState(null);

  const api = useMemo(() => axios.create({
    baseURL: `${backendUrl}/api`,
    headers: {
      Authorization: `Bearer ${token}`,
      // Defeat both browser HTTP cache and any intermediate proxy cache so the
      // Settings page always reflects the latest backend state.
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
    },
  }), [backendUrl, token]);

  // Append `?_t=...` to every GET so even an aggressively-cached proxy can't
  // serve stale credentials/health. Cheap and bulletproof.
  const bust = () => `_t=${Date.now()}`;

  // --- fetchers ---

  const fetchBuildInfo = useCallback(async () => {
    setLoadingBuild(true);
    try {
      const response = await api.get(`/settings/build-info?${bust()}`);
      setBuildInfo(response.data);
    } catch { toast.error("Failed to load build info"); }
    finally { setLoadingBuild(false); }
  }, [api]);

  const fetchCredentials = useCallback(async () => {
    setLoadingCreds(true);
    setCredsError(null);
    try {
      const response = await api.get(`/settings/credentials?${bust()}`);
      setCredentials(response.data.credentials || []);
    } catch (err) {
      setCredsError(err?.response?.data?.detail || err?.message || "Failed to load credentials");
    } finally { setLoadingCreds(false); }
  }, [api]);

  const fetchHealthSummary = useCallback(async () => {
    try {
      const response = await api.get(`/settings/health-status?${bust()}`);
      setHealthSummary(response.data || {});
    } catch { /* silent */ }
  }, [api]);

  const refreshAll = useCallback(async () => {
    // Manual hard refresh — re-pulls everything from the backend without trusting
    // any prior page state. Used by the explicit "Refresh" button and by the
    // visibilitychange/focus handlers below.
    await Promise.all([fetchBuildInfo(), fetchCredentials(), fetchHealthSummary()]);
  }, [fetchBuildInfo, fetchCredentials, fetchHealthSummary]);

  useEffect(() => {
    // Initial data load on mount — fetchers are stable via useCallback
    fetchBuildInfo();
    fetchCredentials();
    fetchHealthSummary();
  }, [fetchBuildInfo, fetchCredentials, fetchHealthSummary]);

  // Refetch when the user returns to this tab/window after being away.
  // Prevents the Settings page from showing stale credentials/health when the
  // user updates a token elsewhere or comes back from a long-running search.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        fetchCredentials();
        fetchHealthSummary();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [fetchCredentials, fetchHealthSummary]);

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

  const testAllCredentials = useCallback(async () => {
    setTestingAll(true);
    try {
      const response = await api.post("/settings/credentials/test-all");
      setTestAllResults(response.data);
      const { passed, failed, tested } = response.data;
      if (failed === 0 && tested > 0) {
        toast.success(`All ${passed} credentials valid`);
      } else if (failed > 0) {
        toast.error(`${failed} of ${tested} credentials failed`);
      } else {
        toast.info("No credentials saved to test");
      }
    } catch {
      toast.error("Failed to run test-all");
    } finally {
      setTestingAll(false);
    }
  }, [api]);

  // --- credential save/reset ---

  const handleSaveCredential = useCallback(async (key, value, opts = {}) => {
    try {
      const payload = { key, value };
      if (opts.expires_at !== undefined && opts.expires_at !== null) {
        payload.expires_at = opts.expires_at;
      }
      await api.put("/settings/credentials", payload);
      toast.success("Credential verified & saved — active now");
      await fetchCredentials();
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

  const handleRevealCredential = useCallback(async (key) => {
    const response = await api.get(`/settings/credentials/${key}/reveal`);
    return response.data.value;
  }, [api]);

  const handleTestCredential = useCallback(async (key) => {
    const response = await api.post(`/settings/credentials/${key}/test`);
    return response.data;
  }, [api]);

  const apifyCreds = useMemo(
    () => credentials.filter((c) => c.service === "apify"),
    [credentials]
  );
  const cloudinaryCreds = useMemo(
    () => credentials.filter((c) => c.service === "cloudinary"),
    [credentials]
  );

  // Derived: status falls back to cached health-summary if no live check yet
  const apifyDerived = {
    status: apifyStatus ? apifyStatus.connected : (healthSummary.apify?.checked_at ? healthSummary.apify.connected : null),
    checkedAt: apifyStatus?.checked_at || healthSummary.apify?.checked_at,
    validUntil: apifyStatus?.valid_until || healthSummary.apify?.valid_until,
    validityMinutes: apifyStatus?.validity_minutes || healthSummary.apify?.validity_minutes,
  };
  const cloudinaryDerived = {
    status: cloudinaryStatus ? cloudinaryStatus.connected : (healthSummary.cloudinary?.checked_at ? healthSummary.cloudinary.connected : null),
    checkedAt: cloudinaryStatus?.checked_at || healthSummary.cloudinary?.checked_at,
    validUntil: cloudinaryStatus?.valid_until || healthSummary.cloudinary?.valid_until,
    validityMinutes: cloudinaryStatus?.validity_minutes || healthSummary.cloudinary?.validity_minutes,
  };
  const mongoDerived = {
    status: mongoStatus ? mongoStatus.connected : (healthSummary.mongodb?.checked_at ? healthSummary.mongodb.connected : null),
    checkedAt: mongoStatus?.checked_at || healthSummary.mongodb?.checked_at,
    validUntil: mongoStatus?.valid_until || healthSummary.mongodb?.valid_until,
    validityMinutes: mongoStatus?.validity_minutes || healthSummary.mongodb?.validity_minutes,
  };

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
              <p className="text-xs text-slate-500">Connections & Configuration · v2.6.14</p>
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
        <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl flex-wrap gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Service Connections</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Verify connections, view & update credentials. Each verified check stays valid for the shown window.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              onClick={refreshAll}
              disabled={loadingCreds || loadingBuild}
              variant="outline"
              className="border-slate-200 text-slate-700 hover:bg-slate-50"
              data-testid="refresh-settings-btn"
              title="Force-refresh credentials, health, and build info — bypasses any cache"
            >
              {(loadingCreds || loadingBuild)
                ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                : <RefreshCw className="w-4 h-4 mr-2" />}
              Refresh
            </Button>
            <Button
              onClick={testAllCredentials}
              disabled={testingAll}
              variant="outline"
              className="border-blue-200 text-blue-700 hover:bg-blue-50"
              data-testid="test-all-credentials-btn"
            >
              {testingAll
                ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                : <KeyRound className="w-4 h-4 mr-2" />}
              Test all credentials
            </Button>
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
        </div>

        {credsError && (
          <div
            className="flex items-start justify-between gap-3 p-4 bg-red-50 border border-red-200 rounded-xl"
            data-testid="creds-error-banner"
          >
            <div className="flex items-start gap-2">
              <XCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-900">Could not load credentials</p>
                <p className="text-xs text-red-700 mt-0.5">{credsError}</p>
                <p className="text-[11px] text-red-600 mt-1">
                  You can still navigate the rest of the page. Hit Retry once the issue is resolved.
                </p>
              </div>
            </div>
            <Button
              onClick={fetchCredentials} size="sm" variant="outline"
              className="border-red-300 text-red-700 hover:bg-red-100 shrink-0"
              data-testid="creds-retry-btn"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Retry
            </Button>
          </div>
        )}

        {testAllResults && (
          <Card
            className={`border-2 ${testAllResults.failed === 0 && testAllResults.tested > 0 ? "border-green-200" : testAllResults.failed > 0 ? "border-red-200" : "border-slate-200"}`}
            data-testid="test-all-results-panel"
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-blue-600" />
                  Test-all Results
                  <Badge variant="outline" className="ml-1 text-xs">
                    {testAllResults.passed} / {testAllResults.tested} passed
                  </Badge>
                  {testAllResults.total - testAllResults.tested > 0 && (
                    <Badge variant="outline" className="text-xs text-slate-500">
                      {testAllResults.total - testAllResults.tested} skipped
                    </Badge>
                  )}
                </CardTitle>
                <Button
                  size="sm" variant="ghost"
                  onClick={() => setTestAllResults(null)}
                  className="h-7 w-7 p-0"
                  data-testid="test-all-dismiss-btn"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-1.5">
                {testAllResults.results.map((r) => {
                  const Icon = r.skipped ? MinusCircle : (r.ok ? CheckCircle2 : XCircle);
                  const color = r.skipped ? "text-slate-400" : (r.ok ? "text-green-600" : "text-red-600");
                  const bg = r.skipped ? "bg-slate-50" : (r.ok ? "bg-green-50" : "bg-red-50");
                  return (
                    <div
                      key={r.key}
                      className={`flex items-start justify-between gap-3 p-2.5 rounded-lg border border-slate-100 ${bg}`}
                      data-testid={`test-all-row-${r.key}`}
                    >
                      <div className="flex items-start gap-2 flex-1 min-w-0">
                        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${color}`} />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-800 truncate">
                            {r.label} <span className="text-slate-400 font-normal">· {r.service}</span>
                          </p>
                          {r.error && (
                            <p className="text-xs text-red-600 mt-0.5 break-words">{r.error}</p>
                          )}
                          {r.ok && r.details?.username && (
                            <p className="text-xs text-slate-500 mt-0.5">Account: <span className="font-medium text-slate-700">{r.details.username}</span></p>
                          )}
                          {r.ok && r.details?.cloud_name && (
                            <p className="text-xs text-slate-500 mt-0.5">Cloud: <span className="font-medium text-slate-700">{r.details.cloud_name}</span></p>
                          )}
                        </div>
                      </div>
                      <Badge
                        className={`text-[10px] shrink-0 ${r.skipped ? "bg-slate-200 text-slate-600" : (r.ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")}`}
                      >
                        {r.skipped ? "Skipped" : (r.ok ? "Valid" : "Invalid")}
                      </Badge>
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-slate-400 mt-3">
                Ran in parallel against live providers at {new Date(testAllResults.tested_at).toLocaleTimeString()}. Audit-logged.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4">
          <ApifyConnectionGuide />

          <ConnectionCard
            title="Apify" icon={Wifi}
            status={apifyDerived.status}
            checkedAt={apifyDerived.checkedAt}
            validUntil={apifyDerived.validUntil}
            validityMinutes={apifyDerived.validityMinutes}
            isChecking={checkingApify}
            onCheck={checkApify}
            credentials={apifyCreds}
            onSaveCredential={handleSaveCredential}
            onResetCredential={handleResetCredential}
            onRevealCredential={handleRevealCredential}
            onTestCredential={handleTestCredential}
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
                  <ErrorResolutionPanel
                    service="apify"
                    error={apifyStatus.errors.join(" | ")}
                    onRetry={checkApify}
                  />
                )}
              </div>
            )}
          </ConnectionCard>

          <ConnectionCard
            title="Cloudinary" icon={Cloud}
            status={cloudinaryDerived.status}
            checkedAt={cloudinaryDerived.checkedAt}
            validUntil={cloudinaryDerived.validUntil}
            validityMinutes={cloudinaryDerived.validityMinutes}
            isChecking={checkingCloudinary}
            onCheck={checkCloudinary}
            credentials={cloudinaryCreds}
            onSaveCredential={handleSaveCredential}
            onResetCredential={handleResetCredential}
            onRevealCredential={handleRevealCredential}
            onTestCredential={handleTestCredential}
          >
            {cloudinaryStatus && (
              <div className="space-y-1">
                <InfoRow label="Cloud Name" value={cloudinaryStatus.cloud_name} mono />
                <InfoRow label="API Key" value={cloudinaryStatus.api_key_hint} mono />
                <InfoRow label="Upload Folder" value="Content for Vibe Check" />
                <InfoRow label="Optimization" value="f_auto / q_auto / vc_auto" mono />
                {cloudinaryStatus.error && (
                  <ErrorResolutionPanel
                    service="cloudinary"
                    error={cloudinaryStatus.error}
                    onRetry={checkCloudinary}
                  />
                )}
              </div>
            )}
          </ConnectionCard>

          <ConnectionCard
            title="MongoDB" icon={Database}
            status={mongoDerived.status}
            checkedAt={mongoDerived.checkedAt}
            validUntil={mongoDerived.validUntil}
            validityMinutes={mongoDerived.validityMinutes}
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
              <ErrorResolutionPanel
                service="mongodb"
                error={mongoStatus.error}
                onRetry={checkMongo}
              />
            )}
            <MongoCredentialView
              mongoUrl={buildInfo?.mongo_url_display}
              dbName={mongoStatus?.database || buildInfo?.database}
            />
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
