import { useState, useEffect } from "react";
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
} from "lucide-react";
import axios from "axios";

export default function HistoryPage({ token, userEmail, onLogout, backendUrl }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState([]);
  const [storeId, setStoreId] = useState(null);
  const [storeName, setStoreName] = useState("");
  
  // Filter state
  const [searchFilter, setSearchFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const api = axios.create({
    baseURL: `${backendUrl}/api`,
    headers: { Authorization: `Bearer ${token}` },
  });

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
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
  };

  const loadCachedSearch = async (cacheKey) => {
    // Navigate to dashboard with cache key to load
    navigate(`/?load=${encodeURIComponent(cacheKey)}`);
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

  // Filter history
  const filteredHistory = history.filter((item) => {
    const matchesSearch = searchFilter === "" || 
      item.search_term?.toLowerCase().includes(searchFilter.toLowerCase()) ||
      item.cache_key?.toLowerCase().includes(searchFilter.toLowerCase());
    
    const matchesType = typeFilter === "all" || item.search_type === typeFilter;
    
    return matchesSearch && matchesType;
  });

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
                View and reload previous searches from cache
              </p>
            </div>
          </div>
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

        {/* History List */}
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
          <div className="space-y-3">
            {filteredHistory.map((item, index) => (
              <Card
                key={item.cache_key || index}
                className="border-slate-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => loadCachedSearch(item.cache_key)}
              >
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
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
                    <div className="flex items-center gap-3">
                      <code className="text-xs bg-slate-100 px-2 py-1 rounded font-mono text-slate-600">
                        {item.cache_key}
                      </code>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-blue-200 text-blue-600 hover:bg-blue-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          loadCachedSearch(item.cache_key);
                        }}
                      >
                        Load Results
                      </Button>
                    </div>
                  </div>
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
