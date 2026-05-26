import { useState, useCallback, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Instagram, ArrowLeft, Settings, Wifi, WifiOff, Cloud,
  Database, CheckCircle2, XCircle, Loader2, RefreshCw,
  User, Clock, Server, Code, Layers, Zap, Shield,
  Hash, ExternalLink,
} from "lucide-react";
import axios from "axios";
import { toast } from "sonner";

function ConnectionCard({ title, icon: Icon, status, checkedAt, isChecking, onCheck, children }) {
  const timeAgo = (iso) => {
    if (!iso) return null;
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const ago = timeAgo(checkedAt);
  const isStale = checkedAt && (Date.now() - new Date(checkedAt).getTime()) > 300000; // 5 min

  return (
    <Card className={`border-2 transition-colors ${status === true ? "border-green-200" : status === false ? "border-red-200" : "border-slate-200"}`} data-testid={`connection-${title.toLowerCase().replace(/\s/g, "-")}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
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
                  {isStale && <Badge variant="outline" className="text-xs h-4 px-1 text-amber-600 border-amber-300">stale</Badge>}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {status === true && <Badge className="bg-green-100 text-green-700 text-xs"><CheckCircle2 className="w-3 h-3 mr-1" />Connected</Badge>}
            {status === false && <Badge className="bg-red-100 text-red-700 text-xs"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>}
            {status === null && <Badge variant="outline" className="text-slate-500 text-xs">Not checked</Badge>}
            <Button variant="ghost" size="sm" onClick={onCheck} disabled={isChecking} className="h-7 px-2" data-testid={`check-${title.toLowerCase().replace(/\s/g, "-")}`}>
              {isChecking ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            </Button>
          </div>
        </div>
      </CardHeader>
      {children && <CardContent className="pt-0">{children}</CardContent>}
    </Card>
  );
}

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
  const [apifyCheckedAt, setApifyCheckedAt] = useState(null);
  const [checkingApify, setCheckingApify] = useState(false);

  const [cloudinaryStatus, setCloudinaryStatus] = useState(null);
  const [cloudinaryCheckedAt, setCloudinaryCheckedAt] = useState(null);
  const [checkingCloudinary, setCheckingCloudinary] = useState(false);

  const [mongoStatus, setMongoStatus] = useState(null);
  const [mongoCheckedAt, setMongoCheckedAt] = useState(null);
  const [checkingMongo, setCheckingMongo] = useState(false);

  const api = useMemo(() => axios.create({
    baseURL: `${backendUrl}/api`,
    headers: { Authorization: `Bearer ${token}` },
  }), [backendUrl, token]);

  const fetchBuildInfo = useCallback(async () => {
    setLoadingBuild(true);
    try {
      const response = await api.get("/settings/build-info");
      setBuildInfo(response.data);
    } catch { toast.error("Failed to load build info"); }
    finally { setLoadingBuild(false); }
  }, [api]);

  useEffect(() => { fetchBuildInfo(); }, [fetchBuildInfo]);

  const checkApify = useCallback(async () => {
    setCheckingApify(true);
    try {
      const response = await api.get("/apify/status");
      setApifyStatus(response.data);
      setApifyCheckedAt(new Date().toISOString());
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
      setCloudinaryCheckedAt(response.data.checked_at);
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
      setMongoCheckedAt(response.data.checked_at);
      toast[response.data.connected ? "success" : "error"](
        response.data.connected ? "MongoDB connected" : "MongoDB connection failed"
      );
    } catch { toast.error("Failed to check MongoDB"); setMongoStatus({ connected: false }); }
    finally { setCheckingMongo(false); }
  }, [api]);

  const checkAll = async () => {
    await Promise.all([checkApify(), checkCloudinary(), checkMongo()]);
  };

  const allConnected = apifyStatus?.connected && cloudinaryStatus?.connected && mongoStatus?.connected;

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
            <Badge variant="outline" className="text-slate-600 border-slate-200"><User className="w-3 h-3 mr-1" />{userEmail}</Badge>
            <Button variant="outline" size="sm" onClick={() => navigate("/")} className="border-slate-200" data-testid="back-to-dashboard">
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
            <p className="text-sm text-slate-500 mt-0.5">Verify all API connections are operational before running searches</p>
          </div>
          <Button onClick={checkAll} disabled={checkingApify || checkingCloudinary || checkingMongo} className="bg-blue-600 hover:bg-blue-700 text-white" data-testid="verify-all-btn">
            {(checkingApify || checkingCloudinary || checkingMongo) ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Shield className="w-4 h-4 mr-2" />}
            Verify All Connections
          </Button>
        </div>

        {/* Connection Cards */}
        <div className="grid gap-4">
          {/* Apify */}
          <ConnectionCard title="Apify" icon={Wifi} status={apifyStatus ? apifyStatus.connected : null}
            checkedAt={apifyCheckedAt} isChecking={checkingApify} onCheck={checkApify}>
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
                    Account: <span className="font-medium text-slate-700">{apifyStatus.account_info.username}</span> / Plan: <span className="font-medium text-slate-700">{apifyStatus.account_info.plan}</span>
                  </div>
                )}
                {apifyStatus.errors?.length > 0 && (
                  <div className="p-2 bg-red-50 rounded text-xs text-red-700 space-y-0.5">
                    {apifyStatus.errors.map((err, i) => <p key={err}>{err}</p>)}
                  </div>
                )}
              </div>
            )}
          </ConnectionCard>

          {/* Cloudinary */}
          <ConnectionCard title="Cloudinary" icon={Cloud} status={cloudinaryStatus ? cloudinaryStatus.connected : null}
            checkedAt={cloudinaryCheckedAt} isChecking={checkingCloudinary} onCheck={checkCloudinary}>
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

          {/* MongoDB */}
          <ConnectionCard title="MongoDB" icon={Database} status={mongoStatus ? mongoStatus.connected : null}
            checkedAt={mongoCheckedAt} isChecking={checkingMongo} onCheck={checkMongo}>
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
                {/* Version Banner */}
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

                {/* Stack Info */}
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

                {/* Cloudinary Config */}
                <div>
                  <Label className="text-xs text-slate-500 uppercase tracking-wide mb-3 block">Cloudinary</Label>
                  <div className="space-y-1 bg-slate-50 rounded-lg p-3">
                    <InfoRow label="Cloud Name" value={buildInfo.integrations?.cloudinary?.cloud_name} mono />
                    <InfoRow label="Upload Folder" value={buildInfo.integrations?.cloudinary?.upload_folder} />
                    <InfoRow label="Configured" value={buildInfo.integrations?.cloudinary?.configured ? "Yes" : "No"} />
                  </div>
                </div>

                {/* Features */}
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
