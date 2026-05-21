import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  Instagram, Search, Download, LogOut, User, Hash,
  Link as LinkIcon, Loader2, Play, ChevronLeft, ChevronRight,
  DollarSign, Clock, Plus, X, Square, HelpCircle,
  FileUp, FileDown, History, Settings, Cloud, Check,
  ExternalLink, RefreshCw, Eye, ChevronDown, ChevronUp,
  ClipboardList, CalendarIcon,
} from "lucide-react";
import axios from "axios";
import { format } from "date-fns";

import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UploadProgressModal } from "@/components/modals/UploadProgressModal";
import { ExecutionStatusModal } from "@/components/modals/ExecutionStatusModal";
import { ApifyStatusModal } from "@/components/modals/ApifyStatusModal";
import { HelpPanel, SEARCH_HELP } from "@/components/HelpPanel";
import { ReelCard } from "@/components/ReelCard";

const MAX_RESULTS_OPTIONS = [5, 10, 25, 50, 100, 250];
const RESULTS_PER_PAGE = 10;
const MAX_USERNAME_FIELDS = 10;

export default function DashboardPage({ token, userEmail, onLogout, backendUrl }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchType, setSearchType] = useState("username");
  const [usernames, setUsernames] = useState([""]);
  const [profileUrls, setProfileUrls] = useState([""]);
  const [hashtagInput, setHashtagInput] = useState("");
  const [maxResults, setMaxResults] = useState(25);
  const [includeTaggedPosts, setIncludeTaggedPosts] = useState(false);
  const [dateRange, setDateRange] = useState({ from: undefined, to: undefined });

  const [runId, setRunId] = useState(() => {
    try { return localStorage.getItem("ig_reel_finder_runId") || null; } catch { return null; }
  });
  const [progress, setProgress] = useState(() => {
    try { return parseInt(localStorage.getItem("ig_reel_finder_progress")) || 0; } catch { return 0; }
  });
  const [estimatedTime, setEstimatedTime] = useState(0);
  const [itemsProcessed, setItemsProcessed] = useState(0);
  const pollIntervalRef = useRef(null);

  const [showStatusModal, setShowStatusModal] = useState(false);
  const [executionStatus, setExecutionStatus] = useState(null);

  const [searching, setSearching] = useState(() => {
    try { return !!localStorage.getItem("ig_reel_finder_runId"); } catch { return false; }
  });
  const [results, setResults] = useState(() => {
    try { return JSON.parse(localStorage.getItem("ig_reel_finder_results")) || []; } catch { return []; }
  });
  const [message, setMessage] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("ig_reel_finder_selected")) || []); } catch { return new Set(); }
  });
  const [expandedTranscripts, setExpandedTranscripts] = useState(new Set());

  const [uploading, setUploading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [uploadedReelIds, setUploadedReelIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("ig_reel_finder_uploaded")) || []); } catch { return new Set(); }
  });
  const [exporting, setExporting] = useState(false);

  const [apifyStatus, setApifyStatus] = useState(null);
  const [checkingApify, setCheckingApify] = useState(false);
  const [showApifyModal, setShowApifyModal] = useState(false);

  // Previously pulled items state
  const [previousSearches, setPreviousSearches] = useState([]);
  const [loadingPrevious, setLoadingPrevious] = useState(false);
  const [showPreviousSection, setShowPreviousSection] = useState(false);
  const [previewData, setPreviewData] = useState({});
  const [loadingPreview, setLoadingPreview] = useState({});

  const api = useMemo(() => axios.create({
    baseURL: `${backendUrl}/api`,
    headers: { Authorization: `Bearer ${token}` },
  }), [backendUrl, token]);

  const showExecutionResult = useCallback((status, message, error = null, resultsCount = 0, searchRunId = null) => {
    setExecutionStatus({ status, message, error, results_count: resultsCount, run_id: searchRunId });
    setShowStatusModal(true);
  }, []);

  const pollSearchStatus = useCallback(async (searchRunId) => {
    try {
      const response = await api.get(`/reels/search/status/${searchRunId}`);
      const { status, progress: prog, estimated_seconds_remaining, results: searchResults, total, message: msg, error, items_processed } = response.data;
      setProgress(prog); setEstimatedTime(estimated_seconds_remaining); setItemsProcessed(items_processed || 0);
      if (status === "SUCCEEDED") {
        clearInterval(pollIntervalRef.current); pollIntervalRef.current = null;
        setSearching(false); setRunId(null); setResults(searchResults || []); setProgress(100); setItemsProcessed(0); setUploadedReelIds(new Set());
        showExecutionResult("SUCCEEDED", msg || `Successfully retrieved ${total} reels`, null, total, searchRunId);
      } else if (status === "FAILED" || status === "TIMED-OUT") {
        clearInterval(pollIntervalRef.current); pollIntervalRef.current = null;
        setSearching(false); setRunId(null); setProgress(0); setItemsProcessed(0);
        showExecutionResult(status, msg, error, 0, searchRunId);
      } else if (status === "ABORTED") {
        clearInterval(pollIntervalRef.current); pollIntervalRef.current = null;
        setSearching(false); setRunId(null); setProgress(0); setItemsProcessed(0);
        showExecutionResult("ABORTED", "Search was stopped by user", null, 0, searchRunId);
      }
    } catch (err) { console.error("Poll error:", err); }
  }, [api, showExecutionResult]);

  const loadCachedSearch = useCallback(async (cacheKey) => {
    setSearching(true); setMessage(""); setResults([]); setSelectedIds(new Set()); setUploadedReelIds(new Set()); setCurrentPage(1);
    try {
      const response = await api.get(`/search-history/${encodeURIComponent(cacheKey)}`);
      setResults(response.data.results || []);
      setSearching(false);
      toast.success(`Loaded ${response.data.total} cached results from ${new Date(response.data.cached_at).toLocaleDateString()}`);
    } catch { setSearching(false); toast.error("Failed to load cached search"); }
  }, [api]);

  // LocalStorage sync
  useEffect(() => { localStorage.setItem("ig_reel_finder_results", JSON.stringify(results)); }, [results]);
  useEffect(() => { localStorage.setItem("ig_reel_finder_selected", JSON.stringify([...selectedIds])); }, [selectedIds]);
  useEffect(() => { localStorage.setItem("ig_reel_finder_uploaded", JSON.stringify([...uploadedReelIds])); }, [uploadedReelIds]);
  useEffect(() => {
    if (runId) {
      localStorage.setItem("ig_reel_finder_runId", runId);
      localStorage.setItem("ig_reel_finder_progress", progress.toString());
    } else {
      localStorage.removeItem("ig_reel_finder_runId");
      localStorage.removeItem("ig_reel_finder_progress");
    }
  }, [runId, progress]);

  // Resume polling on mount
  useEffect(() => {
    const savedRunId = localStorage.getItem("ig_reel_finder_runId");
    if (savedRunId && !pollIntervalRef.current) {
      setRunId(savedRunId);
      setSearching(true);
      pollIntervalRef.current = setInterval(() => pollSearchStatus(savedRunId), 3000);
    }
    return () => { if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; } };
  }, [pollSearchStatus]);

  // Load cached search from URL param
  useEffect(() => {
    const loadParam = searchParams.get("load");
    if (loadParam) { loadCachedSearch(loadParam); setSearchParams({}); }
  }, [searchParams, loadCachedSearch, setSearchParams]);

  const estimatedCost = ((maxResults / 1000) * 2.6).toFixed(2);
  const totalPages = Math.ceil(results.length / RESULTS_PER_PAGE);
  const paginatedResults = results.slice((currentPage - 1) * RESULTS_PER_PAGE, currentPage * RESULTS_PER_PAGE);
  const hasUploadedSelected = Array.from(selectedIds).some(id => uploadedReelIds.has(id));
  const allSelectedUploaded = selectedIds.size > 0 && Array.from(selectedIds).every(id => uploadedReelIds.has(id));

  const addUsernameField = () => { if (usernames.length < MAX_USERNAME_FIELDS) setUsernames([...usernames, ""]); };
  const removeUsernameField = (index) => { if (usernames.length > 1) setUsernames(usernames.filter((_, i) => i !== index)); };
  const updateUsername = (index, value) => { const n = [...usernames]; n[index] = value; setUsernames(n); };

  const addProfileUrlField = () => { if (profileUrls.length < MAX_USERNAME_FIELDS) setProfileUrls([...profileUrls, ""]); };
  const removeProfileUrlField = (index) => { if (profileUrls.length > 1) setProfileUrls(profileUrls.filter((_, i) => i !== index)); };
  const updateProfileUrl = (index, value) => { const n = [...profileUrls]; n[index] = value; setProfileUrls(n); };

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
          let u = part.trim().replace(/^["']|["']$/g, '').replace(/^@/, '').toLowerCase();
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
      setApifyStatus({ connected: false, token_valid: false, username_actor_accessible: false, hashtag_actor_accessible: false, errors: [error.message], message: "Failed" });
      setShowApifyModal(true);
    } finally { setCheckingApify(false); }
  };

  const handleStopSearch = async () => {
    if (!runId) return;
    try {
      const response = await api.post(`/reels/search/stop/${runId}`);
      const { partial_results, items_processed: itemsCount, results_count, message } = response.data;
      clearInterval(pollIntervalRef.current); pollIntervalRef.current = null;
      setSearching(false); setRunId(null); setProgress(0); setItemsProcessed(0);
      if (partial_results?.length > 0) {
        setResults(partial_results); setUploadedReelIds(new Set());
        toast.success(`Stopped search. Retrieved ${results_count} reels from ${itemsCount} items processed.`);
        showExecutionResult("PARTIAL", message, null, results_count, null);
      } else {
        toast.info("Search stopped. No results were collected yet.");
        showExecutionResult("ABORTED", "Search stopped before any results were collected", null, 0, null);
      }
    } catch { toast.error("Failed to stop search"); }
  };

  const handleSearch = async () => {
    let payload = { search_type: searchType, max_results: maxResults };

    // Shared date range filter
    if (dateRange.from) payload.only_posts_newer_than = format(dateRange.from, "yyyy-MM-dd");
    if (dateRange.to) payload.only_posts_older_than = format(dateRange.to, "yyyy-MM-dd");

    if (searchType === "username") {
      const valid = usernames.map(u => u.trim().replace(/^@/, "")).filter(u => u);
      if (!valid.length) { toast.error("Please enter at least one username"); return; }
      payload.usernames = valid;
      if (includeTaggedPosts) payload.include_tagged_posts = true;
    } else if (searchType === "url") {
      const urls = profileUrls.map(u => u.trim()).filter(u => u);
      if (!urls.length) { toast.error("Please enter at least one profile"); return; }
      payload.urls = urls;
    } else if (searchType === "hashtag") {
      const hashtag = hashtagInput.replace(/^#/, "").trim();
      if (!hashtag) { toast.error("Please enter a hashtag"); return; }
      payload.hashtag = hashtag;
    }

    setSearching(true); setMessage(""); setResults([]); setSelectedIds(new Set()); setUploadedReelIds(new Set());
    setCurrentPage(1); setProgress(0); setItemsProcessed(0); setEstimatedTime(maxResults * 2.5);

    try {
      const response = await api.post("/reels/search/start", payload);
      const { run_id, status, message: msg, error } = response.data;
      if (status === "NOT_SUPPORTED") {
        setSearching(false); setMessage(msg);
        showExecutionResult("NOT_SUPPORTED", msg, { error_type: "NOT_SUPPORTED", error_message: msg, error_code: "ACTOR_LIMITATION",
          possible_cause: "The current Apify actor does not support this search mode", suggested_solution: "Use Username or Hashtag mode instead.", technical_details: `Search type: ${searchType}` }, 0, null);
        return;
      }
      if (status === "CACHED") { setRunId(run_id); toast.success("Found cached results!"); pollSearchStatus(run_id); return; }
      if (status === "ERROR") { setSearching(false); showExecutionResult("ERROR", msg, error, 0, null); return; }
      setRunId(run_id); toast.info("Search started...");
      pollIntervalRef.current = setInterval(() => pollSearchStatus(run_id), 3000);
    } catch (error) {
      setSearching(false);
      const msg = error.response?.data?.detail || "Search failed";
      showExecutionResult("ERROR", msg, { error_type: "REQUEST_FAILED", error_message: msg, error_code: "NETWORK_ERROR",
        possible_cause: "Failed to communicate with the server", suggested_solution: "Check your internet connection and try again.", technical_details: error.message }, 0, null);
    }
  };

  const toggleSelect = (id) => { const n = new Set(selectedIds); n.has(id) ? n.delete(id) : n.add(id); setSelectedIds(n); };
  const selectAll = () => { selectedIds.size === results.length ? setSelectedIds(new Set()) : setSelectedIds(new Set(results.map(r => r.id))); };
  const toggleTranscript = (id) => { const n = new Set(expandedTranscripts); n.has(id) ? n.delete(id) : n.add(id); setExpandedTranscripts(n); };

  const handleUpload = async () => {
    const selected = results.filter(r => selectedIds.has(r.id));
    if (!selected.length) { toast.error("Please select at least one reel to upload"); return; }
    const initialItems = selected.map((r, idx) => ({ reel_id: r.id, status: idx === 0 ? "uploading" : "pending", progress: 0, cloudinary_url: "", cloudinary_public_id: "", file_size_bytes: 0, file_size_display: "", error: "" }));
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
    } catch { toast.error("Upload failed"); setUploadStatus(p => ({ ...p, isUploading: false, items: p?.items?.map(i => ({ ...i, status: "failed", error: "Request failed" })) || [] })); }
    finally { setUploading(false); }
  };

  const handleExport = async () => {
    const toExport = results.filter(r => selectedIds.has(r.id) && uploadedReelIds.has(r.id));
    if (!toExport.length) { toast.error("No uploaded reels to export. Upload to Cloudinary first."); return; }
    setExporting(true);
    try {
      const response = await api.post("/reels/export", { reels: toExport, selected_only: true }, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a"); link.href = url;
      const cd = response.headers["content-disposition"];
      link.setAttribute("download", cd ? cd.match(/filename=(.+)/)?.[1] || "reels_export.csv" : "reels_export.csv");
      document.body.appendChild(link); link.click(); link.remove(); window.URL.revokeObjectURL(url);
      toast.success(`Exported ${toExport.length} reels with Cloudinary URLs`);
    } catch { toast.error("Export failed"); }
    finally { setExporting(false); }
  };

  // Previously pulled items
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

  const formatTime = (seconds) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  };

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-white">
        <ExecutionStatusModal isOpen={showStatusModal} onClose={() => setShowStatusModal(false)} executionStatus={executionStatus} />
        <UploadProgressModal isOpen={showUploadModal} onClose={() => !uploading && setShowUploadModal(false)} uploadStatus={uploadStatus} />
        <ApifyStatusModal isOpen={showApifyModal} onClose={() => setShowApifyModal(false)} status={apifyStatus} onRecheck={checkApifyConnection} isChecking={checkingApify} />

        {/* Header */}
        <header className="sticky top-0 z-50 glass border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
                <Instagram className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">IG Reel Finder</h1>
                <p className="text-xs text-slate-500">My Date Jar</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Tooltip><TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={checkApifyConnection} disabled={checkingApify} className="border-slate-200 text-slate-600 hover:text-slate-900" data-testid="check-apify-btn">
                  {checkingApify ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Settings className="w-4 h-4 mr-2" />}API Status
                </Button>
              </TooltipTrigger><TooltipContent><p>Check Apify API connection and actor status</p></TooltipContent></Tooltip>
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

          {/* Search Section */}
          <Card className="border-slate-200 shadow-sm mb-8 animate-fade-in">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <Search className="w-5 h-5 text-blue-600" />Search Reels
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <Tabs value={searchType} onValueChange={setSearchType}>
                <TabsList className="bg-slate-100 p-1">
                  {[
                    { value: "username", icon: User, label: "Username", help: SEARCH_HELP.username.tooltip },
                    { value: "url", icon: LinkIcon, label: "Profile URL", help: SEARCH_HELP.url.tooltip },
                    { value: "hashtag", icon: Hash, label: "Hashtag", help: SEARCH_HELP.hashtag.tooltip },
                  ].map(tab => (
                    <Tooltip key={tab.value}><TooltipTrigger asChild>
                      <TabsTrigger value={tab.value} className="data-[state=active]:bg-white data-[state=active]:text-blue-600" data-testid={`tab-${tab.value}`}>
                        <tab.icon className="w-4 h-4 mr-2" />{tab.label}<HelpCircle className="w-3 h-3 ml-1 text-slate-400" />
                      </TabsTrigger>
                    </TooltipTrigger><TooltipContent><p className="max-w-xs">{tab.help}</p></TooltipContent></Tooltip>
                  ))}
                </TabsList>

                <TabsContent value="username" className="mt-4 space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-slate-700 font-medium">Instagram Username(s)</Label>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-400">{usernames.length}/{MAX_USERNAME_FIELDS} fields</span>
                        <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
                          <Tooltip><TooltipTrigger asChild>
                            <button type="button" onClick={downloadSampleCsv} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 font-medium" data-testid="download-sample-csv">
                              <FileDown className="w-3 h-3" />Sample
                            </button>
                          </TooltipTrigger><TooltipContent><p>Download a sample CSV template</p></TooltipContent></Tooltip>
                          <Tooltip><TooltipTrigger asChild>
                            <label className="cursor-pointer">
                              <input type="file" accept=".csv,.txt" onChange={handleCsvUpload} className="hidden" data-testid="csv-upload-input" />
                              <span className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"><FileUp className="w-3 h-3" />Import CSV</span>
                            </label>
                          </TooltipTrigger><TooltipContent><p>Upload CSV with usernames</p></TooltipContent></Tooltip>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {usernames.map((username, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">@</span>
                            <Input placeholder="user_name" value={username} onChange={(e) => updateUsername(index, e.target.value)} className="h-10 pl-8 border-slate-200 focus:border-blue-500" data-testid={`username-input-${index}`} />
                          </div>
                          {usernames.length > 1 && (
                            <Button type="button" variant="ghost" size="icon" onClick={() => removeUsernameField(index)} className="h-10 w-10 text-slate-400 hover:text-red-500" data-testid={`remove-username-${index}`}>
                              <X className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      {usernames.length < MAX_USERNAME_FIELDS && (
                        <Button type="button" variant="outline" size="sm" onClick={addUsernameField} className="border-dashed border-slate-300 text-slate-600 hover:border-blue-400 hover:text-blue-600" data-testid="add-username-btn">
                          <Plus className="w-4 h-4 mr-1" />Add Username
                        </Button>
                      )}
                      {usernames.length > 1 && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => setUsernames([""])} className="text-slate-500 hover:text-red-600"><X className="w-3 h-3 mr-1" />Clear All</Button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                    <div>
                      <Label className="text-slate-700 font-medium text-sm mb-2 block">Include Tagged Posts</Label>
                      <div className="flex items-center gap-2 mt-2">
                        <Checkbox checked={includeTaggedPosts} onCheckedChange={setIncludeTaggedPosts} data-testid="include-tagged-checkbox" />
                        <span className="text-sm text-slate-600">Include posts where user is tagged</span>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="url" className="mt-4 space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-slate-700 font-medium">Instagram Profile(s)</Label>
                      <span className="text-xs text-slate-400">{profileUrls.length}/{MAX_USERNAME_FIELDS} fields</span>
                    </div>
                    <p className="text-sm text-slate-500 mb-3">Enter a full URL or just the username — both work</p>
                    <div className="space-y-2">
                      {profileUrls.map((url, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                              placeholder="natgeo  or  https://instagram.com/natgeo"
                              value={url}
                              onChange={(e) => updateProfileUrl(index, e.target.value)}
                              className="h-10 pl-10 border-slate-200 focus:border-blue-500 text-sm"
                              data-testid={`url-input-${index}`}
                            />
                          </div>
                          {profileUrls.length > 1 && (
                            <Button type="button" variant="ghost" size="icon" onClick={() => removeProfileUrlField(index)} className="h-10 w-10 text-slate-400 hover:text-red-500" data-testid={`remove-url-${index}`}>
                              <X className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      {profileUrls.length < MAX_USERNAME_FIELDS && (
                        <Button type="button" variant="outline" size="sm" onClick={addProfileUrlField} className="border-dashed border-slate-300 text-slate-600 hover:border-blue-400 hover:text-blue-600" data-testid="add-url-btn">
                          <Plus className="w-4 h-4 mr-1" />Add Profile
                        </Button>
                      )}
                      {profileUrls.length > 1 && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => setProfileUrls([""])} className="text-slate-500 hover:text-red-600"><X className="w-3 h-3 mr-1" />Clear All</Button>
                      )}
                    </div>
                    <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                      <p className="text-xs font-semibold text-blue-700 mb-1">Performance Sweet Spot</p>
                      <p className="text-xs text-blue-600">Up to <strong>5 accounts</strong> with <strong>25 results each</strong> returns fast, reliable data. Going above 10 accounts or 100+ results per account increases run time and cost significantly.</p>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="hashtag" className="mt-4 space-y-4">
                  <div>
                    <Label className="text-slate-700 font-medium">Hashtag</Label>
                    <p className="text-sm text-slate-500 mb-2">Enter hashtag with or without # - returns reels only</p>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">#</span>
                      <Input placeholder="datenight" value={hashtagInput} onChange={(e) => setHashtagInput(e.target.value)} className="h-10 pl-8 border-slate-200 focus:border-blue-500" data-testid="hashtag-input" />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              {/* Date Range Filter - shared across all search types */}
              <div className="flex flex-wrap items-end gap-4 pt-4 border-t border-slate-100">
                <div>
                  <Label className="text-slate-700 font-medium text-sm mb-2 block">Date Range</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="h-10 justify-start text-left font-normal border-slate-200 min-w-[260px]" data-testid="date-range-trigger">
                        <CalendarIcon className="w-4 h-4 mr-2 text-slate-400" />
                        {dateRange.from ? (
                          dateRange.to ? (
                            <span className="text-slate-900">{format(dateRange.from, "MMM d, yyyy")} - {format(dateRange.to, "MMM d, yyyy")}</span>
                          ) : (
                            <span className="text-slate-900">From {format(dateRange.from, "MMM d, yyyy")}</span>
                          )
                        ) : (
                          <span className="text-slate-400">Pick a date range (optional)</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="range" selected={dateRange} onSelect={setDateRange} numberOfMonths={2} disabled={{ after: new Date() }}
                        data-testid="date-range-calendar" />
                      <div className="flex items-center justify-between p-3 border-t border-slate-200">
                        <p className="text-xs text-slate-500">Filters reels by post date</p>
                        {(dateRange.from || dateRange.to) && (
                          <Button variant="ghost" size="sm" onClick={() => setDateRange({ from: undefined, to: undefined })} className="text-xs text-slate-500 hover:text-red-600 h-7" data-testid="clear-date-range-btn">
                            <X className="w-3 h-3 mr-1" />Clear
                          </Button>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Controls */}
              <div className="flex flex-wrap items-end gap-4 pt-4 border-t border-slate-100">
                <div className="min-w-[200px]">
                  <Label className="text-slate-700 font-medium">Max Results</Label>
                  <div className="flex items-center gap-2 mt-2">
                    <Select value={MAX_RESULTS_OPTIONS.includes(maxResults) ? maxResults.toString() : "custom"} onValueChange={(v) => v === "custom" ? (!MAX_RESULTS_OPTIONS.includes(maxResults) || setMaxResults(15)) : setMaxResults(parseInt(v))}>
                      <SelectTrigger className="h-10 border-slate-200 w-[120px]" data-testid="max-results-select"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MAX_RESULTS_OPTIONS.map(opt => <SelectItem key={opt} value={opt.toString()}>{opt}</SelectItem>)}
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                    {!MAX_RESULTS_OPTIONS.includes(maxResults) && (
                      <Input type="number" min="1" max="1000" value={maxResults} onChange={(e) => setMaxResults(Math.max(1, Math.min(1000, parseInt(e.target.value) || 5)))} className="h-10 w-20 border-slate-200" data-testid="custom-max-results" />
                    )}
                    <span className="text-xs text-slate-400">results</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
                  <DollarSign className="w-4 h-4 text-amber-600" />
                  <div><p className="text-xs text-amber-700 font-medium">Est. Cost</p><p className="text-base font-bold text-amber-900">${estimatedCost}</p></div>
                </div>
                <div className="flex items-center gap-2">
                  {!searching ? (
                    <Button onClick={handleSearch} className="h-10 px-6 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-full" data-testid="run-search-btn">
                      <Play className="w-4 h-4 mr-2" />Run Search
                    </Button>
                  ) : (
                    <Button onClick={handleStopSearch} variant="destructive" className="h-10 px-6 font-medium rounded-full" data-testid="stop-search-btn">
                      <Square className="w-4 h-4 mr-2" />Stop Search
                    </Button>
                  )}
                </div>
              </div>

              {searching && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg animate-fade-in">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2"><Loader2 className="w-4 h-4 text-blue-600 animate-spin" /><span className="text-sm font-medium text-blue-800">Searching Instagram...</span></div>
                    <div className="flex items-center gap-3 text-sm text-blue-700">
                      <span className="font-medium">{progress}%</span>
                      {estimatedTime > 0 && <span className="text-blue-600">~{formatTime(estimatedTime)} remaining</span>}
                    </div>
                  </div>
                  <Progress value={progress} className="h-2" />
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-xs text-blue-600">{itemsProcessed > 0 ? `Sifting through ${itemsProcessed} items collected...` : `Fetching up to ${maxResults} reels...`}</p>
                    <p className="text-xs text-blue-500">Click Stop to get partial results anytime</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {message && (
            <div className="mb-6 flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg animate-fade-in">
              <Search className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" /><p className="text-blue-800 text-sm">{message}</p>
            </div>
          )}

          {/* Results */}
          {results.length > 0 && (
            <div className="animate-fade-in">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-4">
                  <h2 className="text-lg font-semibold text-slate-900">Results ({results.length})</h2>
                  <div className="flex items-center gap-2">
                    <Checkbox checked={selectedIds.size === results.length && results.length > 0} onCheckedChange={selectAll} data-testid="select-all-checkbox" />
                    <span className="text-sm text-slate-600">Select all ({selectedIds.size} selected)</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { setResults([]); setSelectedIds(new Set()); setUploadedReelIds(new Set()); setCurrentPage(1); setMessage(""); toast.info("Results cleared"); }}
                    className="text-slate-500 hover:text-red-600 hover:bg-red-50" data-testid="clear-results-btn">
                    <X className="w-4 h-4 mr-1" />Clear Results
                  </Button>
                </div>
                <div className="flex items-center gap-3">
                  <Button size="sm" onClick={handleUpload} disabled={uploading || selectedIds.size === 0} className="bg-blue-600 hover:bg-blue-700 text-white" data-testid="upload-cloudinary-btn">
                    {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Cloud className="w-4 h-4 mr-2" />}Upload to Cloudinary
                  </Button>
                  {hasUploadedSelected && (
                    <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting || !allSelectedUploaded} className="border-slate-200 text-slate-700 hover:bg-slate-50" data-testid="export-csv-btn">
                      {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}Export CSV
                      {!allSelectedUploaded && selectedIds.size > 0 && <Badge variant="outline" className="ml-2 text-xs">Upload first</Badge>}
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                {paginatedResults.map((reel, index) => (
                  <ReelCard key={reel.id} reel={reel} isSelected={selectedIds.has(reel.id)} onToggleSelect={() => toggleSelect(reel.id)}
                    isExpanded={expandedTranscripts.has(reel.id)} onToggleTranscript={() => toggleTranscript(reel.id)}
                    isUploaded={uploadedReelIds.has(reel.id)} index={(currentPage - 1) * RESULTS_PER_PAGE + index + 1} />
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-8">
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="border-slate-200" data-testid="prev-page-btn"><ChevronLeft className="w-4 h-4" /></Button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                      let page;
                      if (totalPages <= 7) page = i + 1;
                      else if (currentPage <= 4) page = i + 1;
                      else if (currentPage >= totalPages - 3) page = totalPages - 6 + i;
                      else page = currentPage - 3 + i;
                      return (
                        <Button key={page} variant={page === currentPage ? "default" : "outline"} size="sm" onClick={() => setCurrentPage(page)}
                          className={page === currentPage ? "bg-blue-600 text-white" : "border-slate-200 text-slate-700"} data-testid={`page-${page}-btn`}>{page}</Button>
                      );
                    })}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="border-slate-200" data-testid="next-page-btn"><ChevronRight className="w-4 h-4" /></Button>
                </div>
              )}
            </div>
          )}

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

                        {/* Inline Preview Carousel */}
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
                                  <div className="text-center"><p className="text-sm font-semibold text-slate-600">+{previewData[item.cache_key].length - 10}</p><p className="text-xs text-slate-500">more</p></div>
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
