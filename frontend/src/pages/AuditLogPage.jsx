import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Instagram,
  ArrowLeft,
  ClipboardList,
  RefreshCw,
  Loader2,
  Search,
  LogIn,
  Upload,
  FileSpreadsheet,
  Wifi,
  StopCircle,
  User,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import axios from "axios";

const ACTION_META = {
  login:                { label: "Login",            icon: LogIn,           color: "bg-green-100 text-green-700" },
  search_started:       { label: "Search Started",   icon: Search,          color: "bg-blue-100 text-blue-700" },
  search_cached:        { label: "Search (Cached)",  icon: Search,          color: "bg-cyan-100 text-cyan-700" },
  search_stopped:       { label: "Search Stopped",   icon: StopCircle,      color: "bg-amber-100 text-amber-700" },
  upload:               { label: "Upload",           icon: Upload,          color: "bg-purple-100 text-purple-700" },
  export:               { label: "CSV Export",       icon: FileSpreadsheet, color: "bg-emerald-100 text-emerald-700" },
  apify_connection_check: { label: "API Check",      icon: Wifi,            color: "bg-slate-100 text-slate-700" },
};

const PAGE_SIZE = 20;

export default function AuditLogPage({ token, userEmail, backendUrl }) {
  const navigate = useNavigate();
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [actionFilter, setActionFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  const api = axios.create({
    baseURL: `${backendUrl}/api`,
    headers: { Authorization: `Bearer ${token}` },
  });

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = { limit: PAGE_SIZE, skip: page * PAGE_SIZE };
      if (actionFilter !== "all") params.action = actionFilter;
      const response = await api.get("/audit-logs", { params });
      setLogs(response.data.logs || []);
      setTotal(response.data.total || 0);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(); }, [page, actionFilter]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const filteredLogs = searchTerm
    ? logs.filter(l =>
        (l.user_email || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (l.action || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        JSON.stringify(l.details || {}).toLowerCase().includes(searchTerm.toLowerCase())
      )
    : logs;

  const formatTimestamp = (ts) => {
    if (!ts) return "N/A";
    try {
      const d = new Date(ts);
      return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
    } catch {
      return ts;
    }
  };

  const formatDetails = (details) => {
    if (!details || typeof details !== "object") return "";
    const parts = [];
    if (details.search_type) parts.push(`Type: ${details.search_type}`);
    if (details.usernames?.length) parts.push(`Users: ${details.usernames.join(", ")}`);
    if (details.hashtag) parts.push(`Hashtag: #${details.hashtag}`);
    if (details.max_results) parts.push(`Max: ${details.max_results}`);
    if (details.results_count !== undefined) parts.push(`Results: ${details.results_count}`);
    if (details.total !== undefined) parts.push(`Total: ${details.total}`);
    if (details.completed !== undefined) parts.push(`Done: ${details.completed}`);
    if (details.failed !== undefined && details.failed > 0) parts.push(`Failed: ${details.failed}`);
    if (details.reels_count) parts.push(`Reels: ${details.reels_count}`);
    if (details.filename) parts.push(`File: ${details.filename}`);
    if (details.cache_key) parts.push(`Cache: ${details.cache_key}`);
    if (details.connected !== undefined) parts.push(`Connected: ${details.connected ? "Yes" : "No"}`);
    if (details.run_id) parts.push(`Run: ${details.run_id.slice(0, 8)}...`);
    if (details.items_processed) parts.push(`Processed: ${details.items_processed}`);
    if (details.partial_results_count) parts.push(`Partial: ${details.partial_results_count}`);
    return parts.join(" / ");
  };

  const getMeta = (action) => ACTION_META[action] || { label: action, icon: ClipboardList, color: "bg-slate-100 text-slate-600" };

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-50 glass border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <Instagram className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Audit Log</h1>
              <p className="text-xs text-slate-500">Activity history</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-slate-600 border-slate-200"><User className="w-3 h-3 mr-1" />{userEmail}</Badge>
            <Button variant="outline" size="sm" onClick={() => navigate("/")} className="border-slate-200" data-testid="back-to-dashboard-btn">
              <ArrowLeft className="w-4 h-4 mr-2" />Dashboard
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-blue-600" />Activity Log
                <Badge variant="outline" className="ml-2 text-xs">{total} entries</Badge>
              </CardTitle>
              <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading} className="border-slate-200" data-testid="refresh-logs-btn">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 mb-4">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input placeholder="Search logs..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 h-9 border-slate-200 text-sm" data-testid="search-logs-input" />
              </div>
              <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(0); }}>
                <SelectTrigger className="w-[180px] h-9 border-slate-200 text-sm" data-testid="action-filter-select"><SelectValue placeholder="Filter by action" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  {Object.entries(ACTION_META).map(([key, meta]) => (
                    <SelectItem key={key} value={key}>{meta.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /><span className="ml-2 text-slate-500">Loading logs...</span></div>
            ) : filteredLogs.length === 0 ? (
              <div className="text-center py-12 text-slate-500">No audit log entries found.</div>
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead className="w-[180px] text-xs font-semibold text-slate-600">Action</TableHead>
                      <TableHead className="w-[200px] text-xs font-semibold text-slate-600">User</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-600">Details</TableHead>
                      <TableHead className="w-[180px] text-xs font-semibold text-slate-600 text-right">Timestamp</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.map((log, idx) => {
                      const meta = getMeta(log.action);
                      const Icon = meta.icon;
                      return (
                        <TableRow key={log.id || idx} className="hover:bg-slate-50" data-testid={`audit-row-${idx}`}>
                          <TableCell>
                            <Badge className={`${meta.color} text-xs font-medium`} data-testid={`audit-action-${idx}`}>
                              <Icon className="w-3 h-3 mr-1" />{meta.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-slate-700">{log.user_email}</TableCell>
                          <TableCell className="text-sm text-slate-600 max-w-md truncate">{formatDetails(log.details)}</TableCell>
                          <TableCell className="text-sm text-slate-500 text-right whitespace-nowrap">{formatTimestamp(log.timestamp)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-xs text-slate-500">Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, total)} of {total}</p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="border-slate-200" data-testid="audit-prev-page">
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm text-slate-600">Page {page + 1} of {totalPages}</span>
                  <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="border-slate-200" data-testid="audit-next-page">
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
