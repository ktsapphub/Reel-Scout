import { useState, useCallback, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TooltipProvider } from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  Instagram, Search, LogOut, User, Hash, Loader2, Play, ChevronRight,
  Clock, RefreshCw, Eye, History, Settings, ClipboardList,
} from "lucide-react";
import axios from "axios";
import { format } from "date-fns";

import { safeGet, safeSet } from "@/lib/safeStorage";
import { validateInstagramHandle, validateInstagramUrl, validateInstagramPostUrl, MAX_POST_URLS } from "@/lib/instagramValidator";
import { UploadProgressModal } from "@/components/modals/UploadProgressModal";
import { ExecutionStatusModal } from "@/components/modals/ExecutionStatusModal";
import { ApifyStatusModal } from "@/components/modals/ApifyStatusModal";
import { HelpPanel } from "@/components/HelpPanel";
import { HealthDot } from "@/components/HealthDot";
import { ConnectionGuardModal } from "@/components/modals/ConnectionGuardModal";
import { SearchForm } from "@/components/dashboard/SearchForm";
import { ResultsGrid } from "@/components/dashboard/ResultsGrid";
import { PresetMenu } from "@/components/dashboard/PresetMenu";
import { useSearchPolling } from "@/hooks/useSearchPolling";

const MAX_USERNAME_FIELDS = 10;

const RESULTS_KEY = "ig_reel_finder_results";
const SELECTED_KEY = "ig_reel_finder_selected";
const UPLOADED_KEY = "ig_reel_finder_uploaded";

export default function DashboardPage({ token, userEmail, onLogout, backendUrl }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  // Form state
  const [searchType, setSearchType] = useState("username");
  const [usernames, setUsernames] = useState([""]);
  const [profileUrls, setProfileUrls] = useState([""]);
  const [postUrls, setPostUrls] = useState([""]);
  const [hashtagInput, setHashtagInput] = useState("");
  const [maxResults, setMaxResults] = useState(25);
  const [includeTaggedPosts, setIncludeTaggedPosts] = useState(false);
  const [dateRange, setDateRange] = useState({ from: undefined, to: undefined });

  // Results state
  const [results, setResults] = useState(() => safeGet(RESULTS_KEY) || []);
  const [message, setMessage] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState(() => new Set(safeGet(SELECTED_KEY) || []));
  const [expandedTranscripts, setExpandedTranscripts] = useState(new Set());

  // Modals & misc
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [executionStatus, setExecutionStatus] = useState(null);

  const [uploading, setUploading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [uploadedReelIds, setUploadedReelIds] = useState(() => new Set(safeGet(UPLOADED_KEY) || []));
  const [exporting, setExporting] = useState(false);

  const [apifyStatus, setApifyStatus] = useState(null);
  const [checkingApify, setCheckingApify] = useState(false);
  const [showApifyModal, setShowApifyModal] = useState(false);

  // Connection guard
  const [showGuardModal, setShowGuardModal] = useState(false);
  const [guardServices, setGuardServices] = useState([]);
  const [guardRechecking, setGuardRechecking] = useState(false);
  const [bypassGuardOnce, setBypassGuardOnce] = useState(false);

  // Previously pulled
  const [previousSearches, setPreviousSearches] = useState([]);
  const [loadingPrevious, setLoadingPrevious] = useState(false);
  const [showPreviousSection, setShowPreviousSection] = useState(false);
  const [previewData, setPreviewData] = useState({});
  const [loadingPreview, setLoadingPreview] = useState({});

  const api = useMemo(() => axios.create({
    baseURL: `${backendUrl}/api`,
    headers: { Authorization: `Bearer ${token}` },
  }), [backendUrl, token]);

  const showExecutionResult = useCallback((status, msg, error = null, resultsCount = 0, searchRunId = null) => {
    setExecutionStatus({ status, message: msg, error, results_count: resultsCount, run_id: searchRunId });
    setShowStatusModal(true);
  }, []);

  const handleSucceeded = useCallback((newResults) => {
    setResults(newResults);
    setUploadedReelIds(new Set());
  }, []);

  const handleRestart = useCallback(() => {
    // Clear all search state + reset form to defaults for a fresh search
    setResults([]);
    setSelectedIds(new Set());
    setUploadedReelIds(new Set());
    setExpandedTranscripts(new Set());
    setCurrentPage(1);
    setMessage("");
    setUsernames([""]);
    setProfileUrls([""]);
    setPostUrls([""]);
    setHashtagInput("");
    setMaxResults(25);
    setIncludeTaggedPosts(false);
    setDateRange({ from: undefined, to: undefined });
    toast.success("Cleared — ready for a new search");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const {
    searching, progress, estimatedTime, itemsProcessed,
    startPolling, stopSearch, resetSearchingFlag,
  } = useSearchPolling({
    api, onSucceeded: handleSucceeded, showExecutionResult,
  });

  // Persist results/selected/uploaded
  useEffect(() => { safeSet(RESULTS_KEY, results); }, [results]);
  useEffect(() => { safeSet(SELECTED_KEY, [...selectedIds]); }, [selectedIds]);
  useEffect(() => { safeSet(UPLOADED_KEY, [...uploadedReelIds]); }, [uploadedReelIds]);

  const loadCachedSearch = useCallback(async (cacheKey) => {
    setMessage(""); setResults([]); setSelectedIds(new Set()); setUploadedReelIds(new Set()); setCurrentPage(1);
    try {
      const response = await api.get(`/search-history/${encodeURIComponent(cacheKey)}`);
      setResults(response.data.results || []);
      toast.success(`Loaded ${response.data.total} cached results from ${new Date(response.data.cached_at).toLocaleDateString()}`);
    } catch { toast.error("Failed to load cached search"); }
  }, [api]);

  // Load cached search via URL param
  useEffect(() => {
    const loadParam = searchParams.get("load");
    if (loadParam) { loadCachedSearch(loadParam); setSearchParams({}); }
  }, [searchParams, loadCachedSearch, setSearchParams]);

  // Resume search — prefill form from History → "Resume" / "Re-run" click
  useEffect(() => {
    const cfg = location.state?.resumeConfig;
    if (!cfg) return;
    setSearchType(cfg.search_type || "username");
    if (cfg.usernames?.length) setUsernames(cfg.usernames);
    if (cfg.urls?.length) setProfileUrls(cfg.urls);
    if (cfg.post_urls?.length) setPostUrls(cfg.post_urls);
    if (cfg.hashtag) setHashtagInput(cfg.hashtag);
    if (cfg.max_results) setMaxResults(cfg.max_results);
    if (typeof cfg.include_tagged_posts === "boolean") setIncludeTaggedPosts(cfg.include_tagged_posts);
    if (cfg.only_posts_newer_than || cfg.only_posts_older_than) {
      setDateRange({
        from: cfg.only_posts_newer_than ? new Date(cfg.only_posts_newer_than) : undefined,
        to: cfg.only_posts_older_than ? new Date(cfg.only_posts_older_than) : undefined,
      });
    }
    toast.success(`Search prefilled — click Run Search to resume (max ${cfg.max_results} reels)`);
    // Clear navigation state so a manual refresh doesn't re-trigger this.
    navigate(location.pathname, { replace: true, state: {} });
    // Scroll to top so the user sees the prefilled form.
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [location.state, location.pathname, navigate]);

  const toggleTranscript = (id) => {
    const n = new Set(expandedTranscripts);
    if (n.has(id)) n.delete(id); else n.add(id);
    setExpandedTranscripts(n);
  };

  const handleCsvUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text !== "string") return;
      const lines = text.split(/[\r\n]+/).filter(l => l.trim());
      const parsed = [];
      for (const line of lines) {
        for (const part of line.split(/[,;\t]+/)) {
          const u = part.trim().replace(/^["']|["']$/g, '').replace(/^@/, '').toLowerCase();
          if (u && u !== "username" && u !== "handle" && u !== "account" && !u.includes("http") && /^[a-zA-Z0-9._]+$/.test(u)) parsed.push(u);
        }
      }
      const unique = [...new Set(parsed)];
      if (!unique.length) { toast.error("No valid usernames found in CSV"); return; }
      const limited = unique.slice(0, MAX_USERNAME_FIELDS);
      setUsernames(limited);
      if (unique.length > MAX_USERNAME_FIELDS) toast.warning(`Imported ${limited.length} usernames (max ${MAX_USERNAME_FIELDS}).`);
      else toast.success(`Imported ${limited.length} username${limited.length > 1 ? 's' : ''} from CSV`);
    };
    reader.readAsText(file);
    event.target.value = "";
  };

  const downloadSampleCsv = () => {
    const blob = new Blob(["# Sample Instagram Usernames CSV\nnatgeo\nnike\nnasa\nmydatejar\nfoodnetwork, tasty, bonappetitmag\ntravelandleisure\n"], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = 'sample_usernames.csv';
    document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
    toast.success("Sample CSV downloaded");
  };

  const checkApifyConnection = async () => {
    setCheckingApify(true);
    try {
      const response = await api.get("/apify/status");
      setApifyStatus(response.data); setShowApifyModal(true);
      toast[response.data.connected ? "success" : "error"](response.data.connected ? "Apify connection verified!" : "Apify connection issues detected");
    } catch (error) {
      toast.error("Failed to check Apify connection");
      setApifyStatus({ connected: false, errors: [error.message], message: "Failed" });
      setShowApifyModal(true);
    } finally { setCheckingApify(false); }
  };

  const handleStopSearch = async () => {
    const result = await stopSearch();
    if (result?.partial_results?.length > 0) {
      setResults(result.partial_results);
      setUploadedReelIds(new Set());
    }
  };

  /**
   * Run a pre-flight connection check. Returns true if it's safe to proceed,
   * or false if the guard modal has been raised (caller should abort).
   */
  const passesGuardCheck = useCallback(async () => {
    if (bypassGuardOnce) {
      setBypassGuardOnce(false);
      return true;
    }
    try {
      const response = await api.get("/settings/health-status");
      const apify = response.data?.apify;
      const cloudinary = response.data?.cloudinary;
      // Apify is critical for any search; Cloudinary only matters at upload time
      const problems = [];
      if (apify && apify.connected === false) {
        problems.push({ name: "apify", state: "failed" });
      } else if (apify && apify.is_stale && apify.checked_at) {
        problems.push({ name: "apify", state: "stale" });
      } else if (!apify || !apify.checked_at) {
        problems.push({ name: "apify", state: "unknown" });
      }
      // Show Cloudinary as warning only if explicitly failed (so user knows uploads will fail later)
      if (cloudinary && cloudinary.connected === false) {
        problems.push({ name: "cloudinary", state: "failed" });
      }
      if (problems.some(p => p.state === "failed")) {
        setGuardServices(problems);
        setShowGuardModal(true);
        return false;
      }
      return true;
    } catch {
      // If health check itself errors, don't block — let the search attempt
      return true;
    }
  }, [api, bypassGuardOnce]);

  const handleGuardRecheck = useCallback(async () => {
    setGuardRechecking(true);
    try {
      const response = await api.get("/apify/status");
      if (response.data?.connected) {
        toast.success("Apify connection restored");
        setShowGuardModal(false);
      } else {
        toast.error("Apify still not connected");
      }
    } catch {
      toast.error("Re-check failed");
    } finally {
      setGuardRechecking(false);
    }
  }, [api]);

  const handleSearch = async () => {
    const payload = { search_type: searchType, max_results: maxResults };

    // Date range applies to username + hashtag searches only — Profile URL
    // searches intentionally don't send date filters (Apify URL flow ignores them).
    if (searchType !== "url") {
      if (dateRange.from) payload.only_posts_newer_than = format(dateRange.from, "yyyy-MM-dd");
      if (dateRange.to) payload.only_posts_older_than = format(dateRange.to, "yyyy-MM-dd");
    }

    if (searchType === "username") {
      const valid = usernames.map(u => u.trim().replace(/^@/, "")).filter(u => u);
      if (!valid.length) { toast.error("Please enter at least one username"); return; }
      const invalid = valid.filter((u) => validateInstagramHandle(u).state === "invalid");
      if (invalid.length) {
        toast.error(`Invalid Instagram username: ${invalid.join(", ")}. Fix red-bordered fields before searching.`);
        return;
      }
      payload.usernames = valid;
      if (includeTaggedPosts) payload.include_tagged_posts = true;
    } else if (searchType === "url") {
      const urls = profileUrls.map(u => u.trim()).filter(u => u);
      if (!urls.length) { toast.error("Please enter at least one profile"); return; }
      const invalid = urls.filter((u) => validateInstagramUrl(u).state === "invalid");
      if (invalid.length) {
        toast.error(`Invalid Instagram profile: ${invalid.join(", ")}. Fix red-bordered fields before searching.`);
        return;
      }
      payload.urls = urls;
    } else if (searchType === "post_url") {
      const urls = postUrls.map(u => u.trim()).filter(u => u);
      if (!urls.length) { toast.error("Please enter at least one reel/post URL"); return; }
      if (urls.length > MAX_POST_URLS) {
        toast.error(`Maximum ${MAX_POST_URLS} post URLs allowed`);
        return;
      }
      const invalid = urls.filter((u) => validateInstagramPostUrl(u).state === "invalid");
      if (invalid.length) {
        toast.error(`Invalid Instagram reel/post URL: ${invalid.join(", ")}. Fix red-bordered fields before searching.`);
        return;
      }
      payload.post_urls = urls;
      payload.max_results = urls.length;  // direct lookup — one item per URL
    } else if (searchType === "hashtag") {
      const hashtag = hashtagInput.replace(/^#/, "").trim();
      if (!hashtag) { toast.error("Please enter a hashtag"); return; }
      payload.hashtag = hashtag;
    }

    // Pre-flight connection guard — blocks if Apify is in a known failed state
    const safe = await passesGuardCheck();
    if (!safe) return;

    setMessage(""); setResults([]); setSelectedIds(new Set()); setUploadedReelIds(new Set());
    setCurrentPage(1);

    try {
      const response = await api.post("/reels/search/start", payload);
      const { run_id, status, message: msg, error } = response.data;
      if (status === "NOT_SUPPORTED") {
        resetSearchingFlag();
        setMessage(msg);
        showExecutionResult("NOT_SUPPORTED", msg, {
          error_type: "NOT_SUPPORTED", error_message: msg, error_code: "ACTOR_LIMITATION",
          possible_cause: "The current Apify actor does not support this search mode",
          suggested_solution: "Use Username or Hashtag mode instead.",
          technical_details: `Search type: ${searchType}`,
        }, 0, null);
        return;
      }
      if (status === "CACHED") { startPolling(run_id, 0); toast.success("Found cached results!"); return; }
      if (status === "ERROR") {
        resetSearchingFlag();
        showExecutionResult("ERROR", msg, error, 0, null);
        return;
      }
      startPolling(run_id, maxResults * 2.5);
      toast.info("Search started...");
    } catch (error) {
      resetSearchingFlag();
      const msg = error.response?.data?.detail || "Search failed";
      showExecutionResult("ERROR", msg, {
        error_type: "REQUEST_FAILED", error_message: msg, error_code: "NETWORK_ERROR",
        possible_cause: "Failed to communicate with the server",
        suggested_solution: "Check your internet connection and try again.",
        technical_details: error.message,
      }, 0, null);
    }
  };

  const handleUpload = async () => {
    const selected = results.filter(r => selectedIds.has(r.id));
    if (!selected.length) { toast.error("Please select at least one reel to upload"); return; }
    const initialItems = selected.map((r, idx) => ({
      reel_id: r.id, status: idx === 0 ? "uploading" : "pending", progress: 0,
      cloudinary_url: "", cloudinary_public_id: "", file_size_bytes: 0, file_size_display: "", error: "",
    }));
    setUploadStatus({ total: selected.length, completed: 0, failed: 0, items: initialItems, isUploading: true });
    setShowUploadModal(true); setUploading(true);
    try {
      const response = await api.post("/reels/upload", { reel_ids: selected.map(r => r.id), reels: selected });
      const { total, completed, failed, items } = response.data;
      const newUploaded = new Set(uploadedReelIds);
      if (items?.length) {
        setResults(prev => prev.map(r => {
          const u = items.find(i => i.reel_id === r.id && i.status === "completed");
          if (u) { newUploaded.add(r.id); return { ...r, cloudinary_url: u.cloudinary_url, cloudinary_public_id: u.cloudinary_public_id }; }
          return r;
        }));
        setUploadedReelIds(newUploaded);
      }
      setUploadStatus({ total, completed, failed, items, isUploading: false });
      if (completed > 0) toast.success(`Uploaded ${completed} video${completed > 1 ? 's' : ''} to Cloudinary`);
      if (failed > 0) toast.error(`${failed} upload${failed > 1 ? 's' : ''} failed`);
    } catch {
      toast.error("Upload failed");
      setUploadStatus(p => ({ ...p, isUploading: false, items: p?.items?.map(i => ({ ...i, status: "failed", error: "Request failed" })) || [] }));
    } finally { setUploading(false); }
  };

  const handleExport = async () => {
    const toExport = results.filter(r => selectedIds.has(r.id));
    if (!toExport.length) { toast.error("Please select at least one reel to export."); return; }
    setExporting(true);
    try {
      const response = await api.post("/reels/export", { reels: toExport, selected_only: true }, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a"); link.href = url;
      const cd = response.headers["content-disposition"];
      link.setAttribute("download", cd ? cd.match(/filename=(.+)/)?.[1] || "reels_export.csv" : "reels_export.csv");
      document.body.appendChild(link); link.click(); link.remove(); window.URL.revokeObjectURL(url);
      const missingCount = toExport.filter(r => !uploadedReelIds.has(r.id)).length;
      if (missingCount > 0) {
        toast.success(`Exported ${toExport.length} reels (${missingCount} recovered from Cloudinary records)`);
      } else {
        toast.success(`Exported ${toExport.length} reels with Cloudinary URLs`);
      }
    } catch { toast.error("Export failed"); }
    finally { setExporting(false); }
  };

  const fetchPreviousSearches = async () => {
    setLoadingPrevious(true);
    try {
      const response = await api.get("/search-history");
      setPreviousSearches(response.data.history || []);
      setShowPreviousSection(true);
    } catch { toast.error("Failed to load previous searches"); }
    finally { setLoadingPrevious(false); }
  };

  const loadPreview = async (cacheKey) => {
    if (previewData[cacheKey]) return;
    setLoadingPreview(prev => ({ ...prev, [cacheKey]: true }));
    try {
      const response = await api.get(`/search-history/${encodeURIComponent(cacheKey)}`);
      setPreviewData(prev => ({ ...prev, [cacheKey]: response.data.results || [] }));
    } catch { toast.error("Failed to load preview"); }
    finally { setLoadingPreview(prev => ({ ...prev, [cacheKey]: false })); }
  };

  const retrySearch = (item) => {
    if (item.search_type === "username") {
      setSearchType("username");
      const users = (item.search_term || "").split(",").map(u => u.trim().replace(/^@/, "").replace(/\(.*\)/, "").trim()).filter(u => u);
      setUsernames(users.length ? users : [""]);
    } else if (item.search_type === "hashtag") {
      setSearchType("hashtag");
      setHashtagInput((item.search_term || "").replace(/^#/, ""));
    }
    toast.info(`Search fields populated with "${item.search_term}". Adjust settings and click Run Search.`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // --- Preset config (serializable snapshot of search form) ---
  const presetConfig = useMemo(() => ({
    searchType,
    usernames,
    profileUrls,
    postUrls,
    hashtagInput,
    maxResults,
    includeTaggedPosts,
    dateRange: {
      from: dateRange.from ? new Date(dateRange.from).toISOString() : null,
      to: dateRange.to ? new Date(dateRange.to).toISOString() : null,
    },
  }), [searchType, usernames, profileUrls, postUrls, hashtagInput, maxResults, includeTaggedPosts, dateRange]);

  const applyPreset = useCallback((config) => {
    if (!config || typeof config !== "object") return;
    if (config.searchType) setSearchType(config.searchType);
    if (Array.isArray(config.usernames) && config.usernames.length) setUsernames(config.usernames);
    if (Array.isArray(config.profileUrls) && config.profileUrls.length) setProfileUrls(config.profileUrls);
    if (Array.isArray(config.postUrls) && config.postUrls.length) setPostUrls(config.postUrls);
    if (typeof config.hashtagInput === "string") setHashtagInput(config.hashtagInput);
    if (typeof config.maxResults === "number") setMaxResults(config.maxResults);
    if (typeof config.includeTaggedPosts === "boolean") setIncludeTaggedPosts(config.includeTaggedPosts);
    if (config.dateRange) {
      setDateRange({
        from: config.dateRange.from ? new Date(config.dateRange.from) : undefined,
        to: config.dateRange.to ? new Date(config.dateRange.to) : undefined,
      });
    }
  }, []);

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-white">
        <ExecutionStatusModal isOpen={showStatusModal} onClose={() => setShowStatusModal(false)} executionStatus={executionStatus} />
        <UploadProgressModal isOpen={showUploadModal} onClose={() => !uploading && setShowUploadModal(false)} uploadStatus={uploadStatus} />
        <ApifyStatusModal isOpen={showApifyModal} onClose={() => setShowApifyModal(false)} status={apifyStatus} onRecheck={checkApifyConnection} isChecking={checkingApify} />
        <ConnectionGuardModal
          open={showGuardModal}
          onClose={() => setShowGuardModal(false)}
          onProceedAnyway={() => { setBypassGuardOnce(true); handleSearch(); }}
          services={guardServices}
          isRechecking={guardRechecking}
          onRecheck={handleGuardRecheck}
        />

        <header className="sticky top-0 z-50 glass border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 ig-gradient rounded-xl flex items-center justify-center shadow-md shadow-pink-500/25">
                <Instagram className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">Reel Scout</h1>
              <p className="text-xs text-slate-500">Instagram Reel scraper</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <HealthDot token={token} backendUrl={backendUrl} />
              <Button variant="outline" size="sm" onClick={() => navigate("/settings")} className="border-slate-200 text-slate-600 hover:text-slate-900" data-testid="settings-btn">
                <Settings className="w-4 h-4 mr-2" />Settings
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate("/history")} className="border-slate-200 text-slate-600 hover:text-slate-900" data-testid="history-btn">
                <History className="w-4 h-4 mr-2" />History
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate("/audit-log")} className="border-slate-200 text-slate-600 hover:text-slate-900" data-testid="audit-log-btn">
                <ClipboardList className="w-4 h-4 mr-2" />Audit Log
              </Button>
              <Badge variant="outline" className="text-slate-600 border-slate-200"><User className="w-3 h-3 mr-1" />{userEmail}</Badge>
              <Button variant="ghost" size="sm" onClick={onLogout} className="text-slate-600 hover:text-slate-900" data-testid="logout-btn">
                <LogOut className="w-4 h-4 mr-2" />Sign Out
              </Button>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-6 py-8">
          <HelpPanel />

          <SearchForm
            searchType={searchType} setSearchType={setSearchType}
            usernames={usernames} setUsernames={setUsernames}
            profileUrls={profileUrls} setProfileUrls={setProfileUrls}
            postUrls={postUrls} setPostUrls={setPostUrls}
            hashtagInput={hashtagInput} setHashtagInput={setHashtagInput}
            maxResults={maxResults} setMaxResults={setMaxResults}
            includeTaggedPosts={includeTaggedPosts} setIncludeTaggedPosts={setIncludeTaggedPosts}
            dateRange={dateRange} setDateRange={setDateRange}
            onSearch={handleSearch} onStop={handleStopSearch}
            onRestart={handleRestart}
            hasResults={results.length > 0}
            onCsvUpload={handleCsvUpload} onDownloadSampleCsv={downloadSampleCsv}
            searching={searching} progress={progress}
            estimatedTime={estimatedTime} itemsProcessed={itemsProcessed}
            presetMenu={
              <PresetMenu
                token={token}
                backendUrl={backendUrl}
                currentConfig={presetConfig}
                onApply={applyPreset}
              />
            }
          />

          {message && (
            <div className="mb-6 flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg animate-fade-in">
              <Search className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <p className="text-blue-800 text-sm">{message}</p>
            </div>
          )}

          <ResultsGrid
            results={results} setResults={setResults}
            selectedIds={selectedIds} setSelectedIds={setSelectedIds}
            uploadedReelIds={uploadedReelIds} setUploadedReelIds={setUploadedReelIds}
            expandedTranscripts={expandedTranscripts} toggleTranscript={toggleTranscript}
            currentPage={currentPage} setCurrentPage={setCurrentPage}
            uploading={uploading} onUpload={handleUpload}
            exporting={exporting} onExport={handleExport}
            setMessage={setMessage}
          />

          {/* Previously Pulled Items */}
          <Card className="border-slate-200 shadow-sm mt-8 animate-fade-in">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                  <History className="w-5 h-5 text-blue-600" />Previously Pulled
                </CardTitle>
                <Button variant="outline" size="sm" onClick={fetchPreviousSearches} disabled={loadingPrevious} className="border-slate-200 text-slate-600" data-testid="load-previous-btn">
                  {loadingPrevious ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                  {previousSearches.length ? "Refresh" : "Load Previous"}
                </Button>
              </div>
            </CardHeader>
            {showPreviousSection && (
              <CardContent className="pt-0">
                {previousSearches.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-4">No previous searches found.</p>
                ) : (
                  <div className="space-y-3">
                    {previousSearches.slice(0, 8).map((item, idx) => (
                      <div key={item.cache_key || idx} className="border border-slate-100 rounded-lg p-3 hover:bg-slate-50 transition-colors" data-testid={`previous-search-${idx}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${item.search_type === "username" ? "bg-blue-100" : "bg-purple-100"}`}>
                              {item.search_type === "username" ? <User className="w-4 h-4 text-blue-600" /> : <Hash className="w-4 h-4 text-purple-600" />}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-slate-900">{item.search_term || item.search_type}</p>
                              <div className="flex items-center gap-3 text-xs text-slate-500">
                                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{item.cached_at ? new Date(item.cached_at).toLocaleDateString() : "N/A"}</span>
                                <span>{item.results_count} results</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm" onClick={() => loadPreview(item.cache_key)} disabled={loadingPreview[item.cache_key]} className="text-slate-500 text-xs" data-testid={`preview-btn-${idx}`}>
                              {loadingPreview[item.cache_key] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3 mr-1" />}Preview
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => retrySearch(item)} className="text-blue-600 text-xs" data-testid={`retry-btn-${idx}`}>
                              <RefreshCw className="w-3 h-3 mr-1" />Retry
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => loadCachedSearch(item.cache_key)} className="border-blue-200 text-blue-600 hover:bg-blue-50 text-xs" data-testid={`load-results-btn-${idx}`}>
                              Load Results
                            </Button>
                          </div>
                        </div>

                        {previewData[item.cache_key] && (
                          <div className="mt-3 pt-3 border-t border-slate-100">
                            <div className="flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
                              {previewData[item.cache_key].slice(0, 10).map((reel, rIdx) => (
                                <div key={reel.id || rIdx} className="flex-shrink-0 w-28 bg-slate-900 rounded-lg overflow-hidden">
                                  {(reel.downloaded_video_url || reel.original_video_url) ? (
                                    <video src={reel.downloaded_video_url || reel.original_video_url} className="w-full h-36 object-cover" preload="metadata" muted />
                                  ) : (
                                    <div className="w-full h-36 bg-slate-800 flex items-center justify-center"><Play className="w-4 h-4 text-slate-600" /></div>
                                  )}
                                  <div className="p-1.5 bg-slate-800">
                                    <p className="text-white text-xs truncate">@{reel.owner_username}</p>
                                  </div>
                                </div>
                              ))}
                              {previewData[item.cache_key].length > 10 && (
                                <div className="flex-shrink-0 w-28 h-36 bg-slate-100 rounded-lg flex items-center justify-center cursor-pointer hover:bg-slate-200" onClick={() => loadCachedSearch(item.cache_key)}>
                                  <div className="text-center">
                                    <p className="text-sm font-semibold text-slate-600">+{previewData[item.cache_key].length - 10}</p>
                                    <p className="text-xs text-slate-500">more</p>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    {previousSearches.length > 8 && (
                      <div className="text-center pt-2">
                        <Button variant="ghost" size="sm" onClick={() => navigate("/history")} className="text-blue-600">
                          View all {previousSearches.length} searches <ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        </main>
      </div>
    </TooltipProvider>
  );
}
