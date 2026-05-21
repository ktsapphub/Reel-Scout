import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Instagram,
  History,
  Search,
  User,
  Hash,
  ArrowLeft,
  Calendar,
  Database,
  Loader2,
  ExternalLink,
  FolderOpen,
  Clock,
  Filter,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Play,
  Eye,
  Maximize2,
  Minimize2,
  X,
  Music,
  Users,
  Layers,
  Check,
} from "lucide-react";
import axios from "axios";

// Preview Card Component for Carousel
function ReelPreviewCard({ reel, isSelected, onToggleSelect }) {
  const videoUrl = reel.downloaded_video_url || reel.original_video_url;
  
  return (
    <div 
      className={`flex-shrink-0 w-48 bg-slate-900 rounded-lg overflow-hidden transition-all ${
        isSelected ? 'ring-2 ring-blue-500 ring-offset-2' : 'hover:ring-1 hover:ring-slate-400'
      }`}
    >
      <div className="relative">
        {videoUrl ? (
          <video 
            src={videoUrl} 
            className="w-full h-64 object-cover" 
            preload="metadata"
            muted
          />
        ) : (
          <div className="w-full h-64 bg-slate-800 flex items-center justify-center">
            <Play className="w-8 h-8 text-slate-600" />
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
          <p className="text-white text-xs font-medium truncate">@{reel.owner_username}</p>
          <p className="text-slate-300 text-xs">{reel.video_duration_seconds}s</p>
        </div>
        {isSelected && (
          <div className="absolute top-2 right-2 bg-blue-500 rounded-full p-1">
            <Check className="w-3 h-3 text-white" />
          </div>
        )}
      </div>
    </div>
  );
}

// Expanded Preview Modal
function ExpandedPreviewModal({ isOpen, onClose, historyItem, results, onLoadResults }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollRef = useRef(null);

  if (!historyItem || !results) return null;

  const currentReel = results[currentIndex];
  const videoUrl = currentReel?.downloaded_video_url || currentReel?.original_video_url;

  const scrollToIndex = (index) => {
    if (scrollRef.current) {
      const cards = scrollRef.current.querySelectorAll('[data-preview-card]');
      if (cards[index]) {
        cards[index].scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
    setCurrentIndex(index);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl h-[85vh] flex flex-col">
        <DialogHeader className="pb-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                historyItem.search_type === "username" ? "bg-blue-100" : "bg-purple-100"
              }`}>
                {historyItem.search_type === "username" ? (
                  <User className="w-5 h-5 text-blue-600" />
                ) : (
                  <Hash className="w-5 h-5 text-purple-600" />
                )}
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold">
                  {historyItem.search_term || historyItem.search_type}
                </DialogTitle>
                <p className="text-sm text-slate-500">{results.length} results • Cached {new Date(historyItem.cached_at).toLocaleDateString()}</p>
              </div>
            </div>
            <Button onClick={() => onLoadResults(historyItem.cache_key)} className="bg-blue-600 hover:bg-blue-700">
              Load All Results
            </Button>
          </div>
        </DialogHeader>

        <div className="flex flex-1 min-h-0 gap-4 py-4">
          {/* Main Video Preview */}
          <div className="w-80 flex-shrink-0 flex flex-col">
            <div className="bg-slate-900 rounded-lg overflow-hidden flex-1">
              {videoUrl ? (
                <video 
                  src={videoUrl} 
                  controls 
                  className="w-full h-full object-contain"
                  key={currentReel?.id}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <p className="text-slate-400">No video available</p>
                </div>
              )}
            </div>
            {currentReel && (
              <div className="mt-3 p-3 bg-slate-50 rounded-lg">
                <p className="font-medium text-slate-900">@{currentReel.owner_username}</p>
                <div className="flex items-center gap-4 mt-1 text-sm text-slate-500">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {currentReel.video_duration_seconds}s
                  </span>
                  {currentReel.timestamp && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {currentReel.timestamp}
                    </span>
                  )}
                </div>
                {currentReel.music_song && (
                  <div className="flex items-center gap-1 mt-2 text-xs text-slate-500">
                    <Music className="w-3 h-3" />
                    {currentReel.music_song}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Horizontal Carousel */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-slate-700">
                Viewing {currentIndex + 1} of {results.length}
              </p>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="icon" 
                  className="h-8 w-8"
                  onClick={() => scrollToIndex(Math.max(0, currentIndex - 1))}
                  disabled={currentIndex === 0}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button 
                  variant="outline" 
                  size="icon" 
                  className="h-8 w-8"
                  onClick={() => scrollToIndex(Math.min(results.length - 1, currentIndex + 1))}
                  disabled={currentIndex === results.length - 1}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
            
            <div 
              ref={scrollRef}
              className="flex gap-3 overflow-x-auto pb-4 scroll-smooth"
              style={{ scrollbarWidth: 'thin' }}
            >
              {results.map((reel, idx) => (
                <div 
                  key={reel.id || idx}
                  data-preview-card
                  className={`flex-shrink-0 w-36 cursor-pointer transition-all ${
                    idx === currentIndex ? 'ring-2 ring-blue-500 scale-105' : 'opacity-70 hover:opacity-100'
                  }`}
                  onClick={() => setCurrentIndex(idx)}
                >
                  <div className="bg-slate-900 rounded-lg overflow-hidden">
                    {(reel.downloaded_video_url || reel.original_video_url) ? (
                      <video 
                        src={reel.downloaded_video_url || reel.original_video_url}
                        className="w-full h-48 object-cover"
                        preload="metadata"
                        muted
                      />
                    ) : (
                      <div className="w-full h-48 bg-slate-800 flex items-center justify-center">
                        <Play className="w-6 h-6 text-slate-600" />
                      </div>
                    )}
                    <div className="p-2 bg-slate-800">
                      <p className="text-white text-xs truncate">@{reel.owner_username}</p>
                      <p className="text-slate-400 text-xs">{reel.video_duration_seconds}s</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Compare Modal
function CompareModal({ isOpen, onClose, compareItems, onLoadResults }) {
  const [scrollPositions, setScrollPositions] = useState({});

  if (compareItems.length === 0) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl h-[85vh] flex flex-col">
        <DialogHeader className="pb-4 border-b border-slate-200 flex-shrink-0">
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-600" />
            Compare Searches ({compareItems.length})
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4">
          <div className="grid gap-6" style={{ gridTemplateColumns: `repeat(${Math.min(compareItems.length, 3)}, 1fr)` }}>
            {compareItems.map((item, idx) => (
              <div key={item.cache_key || idx} className="flex flex-col">
                {/* Header */}
                <div className="flex items-center gap-2 mb-3 p-3 bg-slate-50 rounded-lg">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    item.search_type === "username" ? "bg-blue-100" : "bg-purple-100"
                  }`}>
                    {item.search_type === "username" ? (
                      <User className="w-4 h-4 text-blue-600" />
                    ) : (
                      <Hash className="w-4 h-4 text-purple-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 truncate">{item.search_term}</p>
                    <p className="text-xs text-slate-500">{item.results?.length || 0} results</p>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => onLoadResults(item.cache_key)}
                  >
                    Load
                  </Button>
                </div>

                {/* Results Carousel */}
                <div className="flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
                  {item.results?.slice(0, 20).map((reel, reelIdx) => (
                    <div key={reel.id || reelIdx} className="flex-shrink-0 w-28">
                      <div className="bg-slate-900 rounded-lg overflow-hidden">
                        {(reel.downloaded_video_url || reel.original_video_url) ? (
                          <video 
                            src={reel.downloaded_video_url || reel.original_video_url}
                            className="w-full h-36 object-cover"
                            preload="metadata"
                            muted
                          />
                        ) : (
                          <div className="w-full h-36 bg-slate-800 flex items-center justify-center">
                            <Play className="w-4 h-4 text-slate-600" />
                          </div>
                        )}
                        <div className="p-1.5 bg-slate-800">
                          <p className="text-white text-xs truncate">@{reel.owner_username}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {item.results?.length > 20 && (
                    <div className="flex-shrink-0 w-28 h-36 bg-slate-100 rounded-lg flex items-center justify-center">
                      <p className="text-sm text-slate-500 text-center">+{item.results.length - 20} more</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function HistoryPage({ token, userEmail, onLogout, backendUrl }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState([]);
  const [storeId, setStoreId] = useState(null);
  const [storeName, setStoreName] = useState("");
  
  // Filter state
  const [searchFilter, setSearchFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  // Expanded preview state
  const [expandedItem, setExpandedItem] = useState(null);
  const [expandedResults, setExpandedResults] = useState([]);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Compare mode state
  const [compareMode, setCompareMode] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState(new Set());
  const [compareItems, setCompareItems] = useState([]);
  const [showCompareModal, setShowCompareModal] = useState(false);

  // Inline preview state (for each history item)
  const [inlinePreview, setInlinePreview] = useState({});
  const [loadingInline, setLoadingInline] = useState({});

  const api = useMemo(() => axios.create({
    baseURL: `${backendUrl}/api`,
    headers: { Authorization: `Bearer ${token}` },
  }), [backendUrl, token]);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get("/search-history");
      setHistory(response.data.history || []);
      setStoreId(response.data.store_id);
      setStoreName(response.data.store_name);
    } catch (error) {
      toast.error("Failed to load search history");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const loadCachedSearch = async (cacheKey) => {
    navigate(`/?load=${encodeURIComponent(cacheKey)}`);
  };

  const loadPreviewResults = async (cacheKey) => {
    if (inlinePreview[cacheKey]) return; // Already loaded
    
    setLoadingInline(prev => ({ ...prev, [cacheKey]: true }));
    try {
      const response = await api.get(`/search-history/${encodeURIComponent(cacheKey)}`);
      setInlinePreview(prev => ({ 
        ...prev, 
        [cacheKey]: response.data.results || [] 
      }));
    } catch (error) {
      toast.error("Failed to load preview");
    } finally {
      setLoadingInline(prev => ({ ...prev, [cacheKey]: false }));
    }
  };

  const openExpandedPreview = async (item) => {
    setLoadingPreview(true);
    setExpandedItem(item);
    
    try {
      const response = await api.get(`/search-history/${encodeURIComponent(item.cache_key)}`);
      setExpandedResults(response.data.results || []);
    } catch (error) {
      toast.error("Failed to load results");
      setExpandedItem(null);
    } finally {
      setLoadingPreview(false);
    }
  };

  const toggleCompareSelection = async (item) => {
    const newSelected = new Set(selectedForCompare);
    if (newSelected.has(item.cache_key)) {
      newSelected.delete(item.cache_key);
    } else if (newSelected.size < 3) {
      newSelected.add(item.cache_key);
      // Load results if not already loaded
      if (!inlinePreview[item.cache_key]) {
        await loadPreviewResults(item.cache_key);
      }
    } else {
      toast.warning("Maximum 3 searches can be compared");
      return;
    }
    setSelectedForCompare(newSelected);
  };

  const openCompareView = () => {
    const items = history
      .filter(h => selectedForCompare.has(h.cache_key))
      .map(h => ({
        ...h,
        results: inlinePreview[h.cache_key] || []
      }));
    setCompareItems(items);
    setShowCompareModal(true);
  };

  const formatDate = (isoString) => {
    if (!isoString) return "Unknown";
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  const filteredHistory = history.filter((item) => {
    const matchesSearch = searchFilter === "" || 
      item.search_term?.toLowerCase().includes(searchFilter.toLowerCase()) ||
      item.cache_key?.toLowerCase().includes(searchFilter.toLowerCase());
    
    const matchesType = typeFilter === "all" || item.search_type === typeFilter;
    
    return matchesSearch && matchesType;
  });

  return (
    <div className="min-h-screen bg-white">
      {/* Expanded Preview Modal */}
      <ExpandedPreviewModal
        isOpen={!!expandedItem && !loadingPreview}
        onClose={() => { setExpandedItem(null); setExpandedResults([]); }}
        historyItem={expandedItem}
        results={expandedResults}
        onLoadResults={loadCachedSearch}
      />

      {/* Compare Modal */}
      <CompareModal
        isOpen={showCompareModal}
        onClose={() => setShowCompareModal(false)}
        compareItems={compareItems}
        onLoadResults={loadCachedSearch}
      />

      {/* Loading Preview Modal */}
      {loadingPreview && (
        <Dialog open={true}>
          <DialogContent className="max-w-sm">
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
              <span className="ml-3 text-slate-600">Loading preview...</span>
            </div>
          </DialogContent>
        </Dialog>
      )}

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
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/")}
              className="border-slate-200"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Search
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Page Title */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <History className="w-8 h-8 text-blue-600" />
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Search History</h2>
              <p className="text-sm text-slate-500">
                View, compare, and reload previous searches from cache
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {compareMode && selectedForCompare.size > 0 && (
              <Button
                onClick={openCompareView}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Layers className="w-4 h-4 mr-2" />
                Compare ({selectedForCompare.size})
              </Button>
            )}
            <Button
              variant={compareMode ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setCompareMode(!compareMode);
                if (compareMode) {
                  setSelectedForCompare(new Set());
                }
              }}
              className={compareMode ? "bg-purple-600 hover:bg-purple-700" : "border-slate-200"}
            >
              <Layers className="w-4 h-4 mr-2" />
              {compareMode ? "Exit Compare" : "Compare Mode"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchHistory}
              disabled={loading}
              className="border-slate-200"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Store Info */}
        {storeId && (
          <Card className="border-slate-200 shadow-sm mb-6">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-slate-500" />
                    <span className="text-sm text-slate-600">Keystore:</span>
                    <code className="text-sm bg-slate-100 px-2 py-0.5 rounded font-mono">
                      {storeName}
                    </code>
                  </div>
                  <div className="flex items-center gap-2">
                    <FolderOpen className="w-4 h-4 text-slate-500" />
                    <span className="text-sm text-slate-600">Store ID:</span>
                    <code className="text-sm bg-slate-100 px-2 py-0.5 rounded font-mono">
                      {storeId}
                    </code>
                  </div>
                </div>
                <a
                  href={`https://console.apify.com/storage/key-value-stores/${storeId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-700 text-sm flex items-center gap-1"
                >
                  View in Apify Console
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <Card className="border-slate-200 shadow-sm mb-6">
          <CardContent className="py-4">
            <div className="flex items-center gap-4">
              <Filter className="w-4 h-4 text-slate-500" />
              <div className="flex-1">
                <Input
                  placeholder="Search by username or hashtag..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="h-9 border-slate-200"
                />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[160px] h-9 border-slate-200">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="username">Username</SelectItem>
                  <SelectItem value="hashtag">Hashtag</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* History List with Carousel Preview */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          </div>
        ) : filteredHistory.length === 0 ? (
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="py-12 text-center">
              <History className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                {history.length === 0 ? "No Search History" : "No Matches Found"}
              </h3>
              <p className="text-slate-500">
                {history.length === 0
                  ? "Your search results will be cached here for quick access."
                  : "Try adjusting your filters."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredHistory.map((item, index) => (
              <Card
                key={item.cache_key || index}
                className={`border-slate-200 shadow-sm transition-all ${
                  compareMode && selectedForCompare.has(item.cache_key) 
                    ? 'ring-2 ring-purple-500' 
                    : 'hover:shadow-md'
                }`}
              >
                <CardContent className="py-4">
                  {/* Header Row */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-4">
                      {compareMode && (
                        <input
                          type="checkbox"
                          checked={selectedForCompare.has(item.cache_key)}
                          onChange={() => toggleCompareSelection(item)}
                          className="w-5 h-5 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                        />
                      )}
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        item.search_type === "username" ? "bg-blue-100" : "bg-purple-100"
                      }`}>
                        {item.search_type === "username" ? (
                          <User className="w-5 h-5 text-blue-600" />
                        ) : (
                          <Hash className="w-5 h-5 text-purple-600" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={item.search_type === "username" 
                              ? "border-blue-200 text-blue-700 bg-blue-50"
                              : "border-purple-200 text-purple-700 bg-purple-50"
                            }
                          >
                            {item.search_type === "username" ? "Username" : "Hashtag"}
                          </Badge>
                          <span className="font-medium text-slate-900">
                            {item.search_term || "Search"}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-sm text-slate-500">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDate(item.cached_at)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Database className="w-3 h-3" />
                            {item.results_count} results
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => loadPreviewResults(item.cache_key)}
                        disabled={loadingInline[item.cache_key]}
                        className="text-slate-600 hover:text-slate-900"
                      >
                        {loadingInline[item.cache_key] ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : inlinePreview[item.cache_key] ? (
                          <Eye className="w-4 h-4 mr-1" />
                        ) : (
                          <Eye className="w-4 h-4 mr-1" />
                        )}
                        {inlinePreview[item.cache_key] ? "Hide" : "Preview"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openExpandedPreview(item)}
                        className="text-slate-600 hover:text-slate-900"
                      >
                        <Maximize2 className="w-4 h-4 mr-1" />
                        Expand
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-blue-200 text-blue-600 hover:bg-blue-50"
                        onClick={() => loadCachedSearch(item.cache_key)}
                      >
                        Load Results
                      </Button>
                    </div>
                  </div>

                  {/* Inline Horizontal Carousel Preview */}
                  {inlinePreview[item.cache_key] && inlinePreview[item.cache_key].length > 0 && (
                    <div className="border-t border-slate-100 pt-4">
                      <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
                        {inlinePreview[item.cache_key].slice(0, 15).map((reel, reelIdx) => (
                          <div 
                            key={reel.id || reelIdx} 
                            className="flex-shrink-0 w-32 cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => openExpandedPreview(item)}
                          >
                            <div className="bg-slate-900 rounded-lg overflow-hidden">
                              {(reel.downloaded_video_url || reel.original_video_url) ? (
                                <video 
                                  src={reel.downloaded_video_url || reel.original_video_url}
                                  className="w-full h-44 object-cover"
                                  preload="metadata"
                                  muted
                                />
                              ) : (
                                <div className="w-full h-44 bg-slate-800 flex items-center justify-center">
                                  <Play className="w-5 h-5 text-slate-600" />
                                </div>
                              )}
                              <div className="p-2 bg-slate-800">
                                <p className="text-white text-xs truncate">@{reel.owner_username}</p>
                                <p className="text-slate-400 text-xs">{reel.video_duration_seconds}s</p>
                              </div>
                            </div>
                          </div>
                        ))}
                        {inlinePreview[item.cache_key].length > 15 && (
                          <div 
                            className="flex-shrink-0 w-32 h-44 bg-slate-100 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-slate-200 transition-colors"
                            onClick={() => openExpandedPreview(item)}
                          >
                            <p className="text-lg font-semibold text-slate-600">+{inlinePreview[item.cache_key].length - 15}</p>
                            <p className="text-xs text-slate-500">more results</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Summary */}
        {!loading && history.length > 0 && (
          <div className="mt-6 text-center text-sm text-slate-500">
            Showing {filteredHistory.length} of {history.length} cached searches
          </div>
        )}
      </main>
    </div>
  );
}
