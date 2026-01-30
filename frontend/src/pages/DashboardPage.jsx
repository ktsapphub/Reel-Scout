import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Instagram,
  Search,
  Upload,
  Download,
  LogOut,
  User,
  Hash,
  Link as LinkIcon,
  Loader2,
  Play,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Clock,
  Music,
  Users,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  FileText,
  AlertCircle,
} from "lucide-react";
import axios from "axios";

const MAX_RESULTS_OPTIONS = [10, 25, 50, 100, 250];
const RESULTS_PER_PAGE = 10;

export default function DashboardPage({ token, userEmail, onLogout, backendUrl }) {
  // Search state
  const [searchType, setSearchType] = useState("username");
  const [usernameInput, setUsernameInput] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [hashtagInput, setHashtagInput] = useState("");
  const [maxResults, setMaxResults] = useState(25);
  const [searching, setSearching] = useState(false);

  // Results state
  const [results, setResults] = useState([]);
  const [message, setMessage] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [expandedTranscripts, setExpandedTranscripts] = useState(new Set());

  // Action states
  const [uploading, setUploading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const api = axios.create({
    baseURL: `${backendUrl}/api`,
    headers: { Authorization: `Bearer ${token}` },
  });

  // Calculate estimated cost
  const estimatedCost = ((maxResults / 1000) * 2.6).toFixed(2);

  // Pagination
  const totalPages = Math.ceil(results.length / RESULTS_PER_PAGE);
  const paginatedResults = results.slice(
    (currentPage - 1) * RESULTS_PER_PAGE,
    currentPage * RESULTS_PER_PAGE
  );

  const handleSearch = async () => {
    let payload = {
      search_type: searchType,
      max_results: maxResults,
    };

    if (searchType === "username") {
      const usernames = usernameInput
        .split(/[,\n]/)
        .map((u) => u.trim())
        .filter((u) => u);
      if (usernames.length === 0) {
        toast.error("Please enter at least one username");
        return;
      }
      payload.usernames = usernames;
    } else if (searchType === "url") {
      const urls = urlInput
        .split("\n")
        .map((u) => u.trim())
        .filter((u) => u);
      if (urls.length === 0) {
        toast.error("Please enter at least one URL");
        return;
      }
      payload.urls = urls;
    } else if (searchType === "hashtag") {
      const hashtag = hashtagInput.replace(/^#/, "").trim();
      if (!hashtag) {
        toast.error("Please enter a hashtag");
        return;
      }
      payload.hashtag = hashtag;
    }

    setSearching(true);
    setMessage("");
    setResults([]);
    setSelectedIds(new Set());
    setCurrentPage(1);

    try {
      const response = await api.post("/reels/search", payload);
      setResults(response.data.results || []);
      setMessage(response.data.message || "");
      if (response.data.message) {
        toast.info(response.data.message);
      } else if (response.data.results?.length === 0) {
        toast.info("No results found");
      } else {
        toast.success(`Found ${response.data.results.length} reels`);
      }
    } catch (error) {
      const msg = error.response?.data?.detail || "Search failed";
      toast.error(msg);
    } finally {
      setSearching(false);
    }
  };

  const toggleSelect = (id) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const selectAll = () => {
    if (selectedIds.size === results.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(results.map((r) => r.id)));
    }
  };

  const toggleTranscript = (id) => {
    const newExpanded = new Set(expandedTranscripts);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedTranscripts(newExpanded);
  };

  const handleUpload = async () => {
    const selected = results.filter((r) => selectedIds.has(r.id));
    if (selected.length === 0) {
      toast.error("Please select at least one reel to upload");
      return;
    }

    setUploading(true);
    try {
      const response = await api.post("/reels/upload", {
        reel_ids: selected.map((r) => r.id),
        reels: selected,
      });

      const { uploaded, errors } = response.data;
      
      // Update results with cloudinary info
      if (uploaded && uploaded.length > 0) {
        setResults((prev) =>
          prev.map((r) => {
            const uploadedItem = uploaded.find((u) => u.reel_id === r.id);
            if (uploadedItem) {
              return {
                ...r,
                cloudinary_url: uploadedItem.cloudinary_url,
                cloudinary_public_id: uploadedItem.cloudinary_public_id,
              };
            }
            return r;
          })
        );
        toast.success(`Uploaded ${uploaded.length} reels to Cloudinary`);
      }

      if (errors && errors.length > 0) {
        toast.error(`${errors.length} uploads failed`);
      }
    } catch (error) {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleExport = async (exportAll = false) => {
    const toExport = exportAll
      ? results
      : results.filter((r) => selectedIds.has(r.id));

    if (toExport.length === 0) {
      toast.error("No reels to export");
      return;
    }

    setExporting(true);
    try {
      const response = await api.post(
        "/reels/export",
        { reels: toExport, selected_only: !exportAll },
        { responseType: "blob" }
      );

      // Download file
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      
      // Get filename from Content-Disposition header or generate one
      const contentDisposition = response.headers["content-disposition"];
      let filename = "reels_export.csv";
      if (contentDisposition) {
        const match = contentDisposition.match(/filename=(.+)/);
        if (match) filename = match[1];
      }
      
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success(`Exported ${toExport.length} reels`);
    } catch (error) {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
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
          <div className="flex items-center gap-4">
            <Badge variant="outline" className="text-slate-600 border-slate-200">
              <User className="w-3 h-3 mr-1" />
              {userEmail}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={onLogout}
              className="text-slate-600 hover:text-slate-900"
              data-testid="logout-btn"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Search Section */}
        <Card className="border-slate-200 shadow-sm mb-8 animate-fade-in">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Search className="w-5 h-5 text-blue-600" />
              Search Reels
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Search Type Tabs */}
            <Tabs value={searchType} onValueChange={setSearchType}>
              <TabsList className="bg-slate-100 p-1">
                <TabsTrigger
                  value="username"
                  className="data-[state=active]:bg-white data-[state=active]:text-blue-600"
                  data-testid="tab-username"
                >
                  <User className="w-4 h-4 mr-2" />
                  Username
                </TabsTrigger>
                <TabsTrigger
                  value="url"
                  className="data-[state=active]:bg-white data-[state=active]:text-blue-600"
                  data-testid="tab-url"
                >
                  <LinkIcon className="w-4 h-4 mr-2" />
                  Direct URL
                </TabsTrigger>
                <TabsTrigger
                  value="hashtag"
                  className="data-[state=active]:bg-white data-[state=active]:text-blue-600"
                  data-testid="tab-hashtag"
                >
                  <Hash className="w-4 h-4 mr-2" />
                  Hashtag
                </TabsTrigger>
              </TabsList>

              <TabsContent value="username" className="mt-4 space-y-4">
                <div>
                  <Label className="text-slate-700 font-medium">
                    Instagram Username(s)
                  </Label>
                  <p className="text-sm text-slate-500 mb-2">
                    Enter one username or multiple (comma or newline separated)
                  </p>
                  <Textarea
                    placeholder="natgeo&#10;nike&#10;adidas"
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    className="h-24 border-slate-200 focus:border-blue-500"
                    data-testid="username-input"
                  />
                </div>
              </TabsContent>

              <TabsContent value="url" className="mt-4 space-y-4">
                <div>
                  <Label className="text-slate-700 font-medium">
                    Instagram Reel URLs
                  </Label>
                  <p className="text-sm text-slate-500 mb-2">
                    Enter one URL per line
                  </p>
                  <Textarea
                    placeholder="https://www.instagram.com/reel/ABC123/&#10;https://www.instagram.com/reel/XYZ789/"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    className="h-24 border-slate-200 focus:border-blue-500"
                    data-testid="url-input"
                  />
                </div>
              </TabsContent>

              <TabsContent value="hashtag" className="mt-4 space-y-4">
                <div>
                  <Label className="text-slate-700 font-medium">Hashtag</Label>
                  <p className="text-sm text-slate-500 mb-2">
                    Enter hashtag with or without #
                  </p>
                  <Input
                    placeholder="#datenight"
                    value={hashtagInput}
                    onChange={(e) => setHashtagInput(e.target.value)}
                    className="h-12 border-slate-200 focus:border-blue-500"
                    data-testid="hashtag-input"
                  />
                </div>
              </TabsContent>
            </Tabs>

            {/* Max Results & Cost */}
            <div className="flex flex-wrap items-end gap-6">
              <div className="min-w-[200px]">
                <Label className="text-slate-700 font-medium">Max Results</Label>
                <Select
                  value={maxResults.toString()}
                  onValueChange={(v) => setMaxResults(parseInt(v))}
                >
                  <SelectTrigger className="mt-2 h-12 border-slate-200" data-testid="max-results-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MAX_RESULTS_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt.toString()}>
                        {opt} results
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                <DollarSign className="w-5 h-5 text-amber-600" />
                <div>
                  <p className="text-xs text-amber-700 font-medium">Estimated Cost</p>
                  <p className="text-lg font-bold text-amber-900">${estimatedCost} USD</p>
                </div>
              </div>

              <Button
                onClick={handleSearch}
                disabled={searching}
                className="h-12 px-8 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-full transition-colors"
                data-testid="run-search-btn"
              >
                {searching ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Run Search
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Message Alert */}
        {message && (
          <div className="mb-6 flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg animate-fade-in">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <p className="text-blue-800 text-sm">{message}</p>
          </div>
        )}

        {/* Results Section */}
        {results.length > 0 && (
          <div className="animate-fade-in">
            {/* Results Header */}
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-4">
                <h2 className="text-lg font-semibold text-slate-900">
                  Results ({results.length})
                </h2>
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={selectedIds.size === results.length && results.length > 0}
                    onCheckedChange={selectAll}
                    data-testid="select-all-checkbox"
                  />
                  <span className="text-sm text-slate-600">
                    Select all ({selectedIds.size} selected)
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => handleExport(false)}
                  disabled={exporting || selectedIds.size === 0}
                  className="border-slate-200 text-slate-700 hover:bg-slate-50"
                  data-testid="export-selected-btn"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export Selected
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleExport(true)}
                  disabled={exporting}
                  className="border-slate-200 text-slate-700 hover:bg-slate-50"
                  data-testid="export-all-btn"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Export All
                </Button>
                <Button
                  onClick={handleUpload}
                  disabled={uploading || selectedIds.size === 0}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  data-testid="upload-cloudinary-btn"
                >
                  {uploading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4 mr-2" />
                  )}
                  Upload to Cloudinary
                </Button>
              </div>
            </div>

            {/* Results List */}
            <div className="space-y-4">
              {paginatedResults.map((reel, index) => (
                <ReelRow
                  key={reel.id}
                  reel={reel}
                  isSelected={selectedIds.has(reel.id)}
                  onToggleSelect={() => toggleSelect(reel.id)}
                  isExpanded={expandedTranscripts.has(reel.id)}
                  onToggleTranscript={() => toggleTranscript(reel.id)}
                  index={(currentPage - 1) * RESULTS_PER_PAGE + index + 1}
                />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="border-slate-200"
                  data-testid="prev-page-btn"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <Button
                      key={page}
                      variant={page === currentPage ? "default" : "outline"}
                      size="sm"
                      onClick={() => setCurrentPage(page)}
                      className={
                        page === currentPage
                          ? "bg-blue-600 text-white"
                          : "border-slate-200 text-slate-700"
                      }
                      data-testid={`page-${page}-btn`}
                    >
                      {page}
                    </Button>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="border-slate-200"
                  data-testid="next-page-btn"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// Reel Row Component
function ReelRow({ reel, isSelected, onToggleSelect, isExpanded, onToggleTranscript, index }) {
  const videoUrl = reel.downloaded_video_url || reel.original_video_url;
  const truncatedTranscript =
    reel.video_transcript?.length > 100
      ? reel.video_transcript.slice(0, 100) + "..."
      : reel.video_transcript;

  return (
    <Card className="border-slate-200 overflow-hidden hover-lift" data-testid={`reel-row-${index}`}>
      <div className="flex flex-col lg:flex-row">
        {/* Video Player - Left */}
        <div className="lg:w-80 flex-shrink-0 bg-slate-900 p-4">
          <div className="flex items-center gap-3 mb-3">
            <Checkbox
              checked={isSelected}
              onCheckedChange={onToggleSelect}
              data-testid={`select-reel-${index}`}
            />
            <span className="text-white text-sm font-medium">#{index}</span>
          </div>
          {videoUrl ? (
            <video
              src={videoUrl}
              controls
              className="w-full aspect-[9/16] max-h-[320px] object-contain rounded-lg"
              preload="metadata"
              data-testid={`video-player-${index}`}
            >
              Your browser does not support the video tag.
            </video>
          ) : (
            <div className="w-full aspect-[9/16] max-h-[320px] bg-slate-800 rounded-lg flex items-center justify-center">
              <p className="text-slate-400 text-sm">No video available</p>
            </div>
          )}
        </div>

        {/* Metadata Panel - Right */}
        <div className="flex-1 p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Owner Info */}
            <div>
              <Label className="text-xs text-slate-500 uppercase tracking-wide">Owner</Label>
              <p className="font-semibold text-slate-900">@{reel.owner_username}</p>
              {reel.owner_full_name && (
                <p className="text-sm text-slate-600">{reel.owner_full_name}</p>
              )}
            </div>

            {/* Duration */}
            <div>
              <Label className="text-xs text-slate-500 uppercase tracking-wide">Duration</Label>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400" />
                <span className="text-slate-900">{reel.video_duration_seconds}s</span>
              </div>
            </div>

            {/* Timestamp */}
            <div>
              <Label className="text-xs text-slate-500 uppercase tracking-wide">Posted</Label>
              <p className="text-slate-900">{reel.timestamp || "N/A"}</p>
            </div>

            {/* Reel URL */}
            <div>
              <Label className="text-xs text-slate-500 uppercase tracking-wide">Reel URL</Label>
              <a
                href={reel.reel_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-700 text-sm flex items-center gap-1"
              >
                View on Instagram
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            {/* Music Info */}
            {(reel.music_artist || reel.music_song) && (
              <div className="md:col-span-2">
                <Label className="text-xs text-slate-500 uppercase tracking-wide">Music</Label>
                <div className="flex items-center gap-2 text-slate-700">
                  <Music className="w-4 h-4 text-slate-400" />
                  <span>
                    {reel.music_song || "Unknown"} - {reel.music_artist || "Unknown"}
                    {reel.music_original_audio && (
                      <Badge variant="outline" className="ml-2 text-xs">
                        Original
                      </Badge>
                    )}
                  </span>
                </div>
              </div>
            )}

            {/* Tagged Users */}
            {reel.tagged_users?.length > 0 && (
              <div className="md:col-span-2">
                <Label className="text-xs text-slate-500 uppercase tracking-wide">Tagged Users</Label>
                <div className="flex items-center gap-2 flex-wrap mt-1">
                  <Users className="w-4 h-4 text-slate-400" />
                  {reel.tagged_users.map((user, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      @{user}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Transcript */}
            {reel.video_transcript && (
              <div className="md:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-xs text-slate-500 uppercase tracking-wide">
                    Transcript
                  </Label>
                  {reel.video_transcript.length > 100 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onToggleTranscript}
                      className="text-blue-600 text-xs h-6 px-2"
                      data-testid={`toggle-transcript-${reel.id}`}
                    >
                      {isExpanded ? (
                        <>
                          <ChevronUp className="w-3 h-3 mr-1" /> Collapse
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-3 h-3 mr-1" /> Expand
                        </>
                      )}
                    </Button>
                  )}
                </div>
                <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg">
                  {isExpanded ? reel.video_transcript : truncatedTranscript}
                </p>
              </div>
            )}

            {/* Cloudinary Status */}
            {reel.cloudinary_url && (
              <div className="md:col-span-2">
                <Label className="text-xs text-slate-500 uppercase tracking-wide">
                  Cloudinary
                </Label>
                <div className="flex items-center gap-2">
                  <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                    Uploaded
                  </Badge>
                  <a
                    href={reel.cloudinary_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-700 text-sm flex items-center gap-1"
                  >
                    View
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
