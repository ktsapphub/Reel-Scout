import { useState, useCallback, useEffect, useRef } from "react";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
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
  Plus,
  X,
  Square,
  Calendar,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Code,
  Lightbulb,
  Maximize2,
  Minimize2,
  Copy,
  Cloud,
  HardDrive,
  Check,
  HelpCircle,
  BookOpen,
  ArrowRight,
  FileSpreadsheet,
} from "lucide-react";
import axios from "axios";

const MAX_RESULTS_OPTIONS = [10, 25, 50, 100, 250];
const RESULTS_PER_PAGE = 10;
const MAX_USERNAME_FIELDS = 10;

// Help Content Data
const SEARCH_HELP = {
  username: {
    tooltip: "Search for reels from specific Instagram accounts by entering their usernames directly.",
    title: "Search by Username",
    description: "Get rich details about all reels from one or more Instagram users.",
    whatCanBeExtracted: [
      "Reel metadata (caption, timestamp, hashtags, mentions, tagged users)",
      "Transcript (if available)",
      "Product tags and music info (artist, original audio)",
      "Engagement metrics (likes, comments, shares, views/play counts)",
      "Video download URL and thumbnails",
      "Comment details with timestamps",
      "Sponsored content and co-author info"
    ],
    bestUseCases: [
      "Detailed analytics on specific creators",
      "Competitive analysis for known accounts",
      "Data collection for reporting or AI workflows"
    ],
    tips: [
      "Enter usernames without the @ symbol",
      "Add multiple usernames to compare creators",
      "Underscores are allowed in usernames"
    ]
  },
  url: {
    tooltip: "Paste Instagram profile URLs and we'll extract the usernames to find their reels.",
    title: "Search by Profile URL",
    description: "Paste full Instagram profile URLs - we'll extract usernames automatically.",
    whatCanBeExtracted: [
      "Same as Username search - full reel details",
      "All public reels from the profile",
      "Complete metadata and engagement metrics"
    ],
    bestUseCases: [
      "When you have profile links saved or shared",
      "Copy-paste directly from Instagram",
      "Batch processing multiple profile links"
    ],
    tips: [
      "Supports: instagram.com/username format",
      "One URL per line for multiple profiles",
      "Also accepts plain usernames without full URL"
    ]
  },
  hashtag: {
    tooltip: "Discover reels tagged with specific hashtags - great for trending topics and content discovery.",
    title: "Search by Hashtag",
    description: "Find trending reels and posts associated with specific hashtags.",
    whatCanBeExtracted: [
      "Posts and reels tagged with the hashtag",
      "Caption and timestamp",
      "Media type (post vs reel)",
      "Likes, plays/views, shares, comments count",
      "Video URLs and thumbnails",
      "Audio metadata and related hashtags"
    ],
    bestUseCases: [
      "Trend discovery by topic",
      "Find trending reels under a hashtag",
      "Competitive analysis for hashtag performance",
      "Bulk collection by topic rather than user"
    ],
    tips: [
      "Enter hashtag with or without # symbol",
      "Good for discovering new content creators",
      "Combine with Username search for deeper analysis"
    ]
  }
};

// Help Panel Component
function HelpPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("username");

  return (
    <Card className="border-slate-200 shadow-sm mb-6 animate-fade-in">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-slate-50 transition-colors py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-blue-600" />
                <CardTitle className="text-base font-semibold text-slate-900">
                  How to Search & Workflow Guide
                </CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {isOpen ? "Click to collapse" : "Click to expand"}
                </Badge>
                {isOpen ? (
                  <ChevronUp className="w-4 h-4 text-slate-500" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-500" />
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 pb-4">
            {/* Search Type Tabs */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Search Methods</h3>
              <div className="flex gap-2 mb-4">
                <Button
                  variant={activeSection === "username" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActiveSection("username")}
                  className={activeSection === "username" ? "bg-blue-600" : ""}
                >
                  <User className="w-4 h-4 mr-1" />
                  Username
                </Button>
                <Button
                  variant={activeSection === "url" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActiveSection("url")}
                  className={activeSection === "url" ? "bg-blue-600" : ""}
                >
                  <LinkIcon className="w-4 h-4 mr-1" />
                  Profile URL
                </Button>
                <Button
                  variant={activeSection === "hashtag" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActiveSection("hashtag")}
                  className={activeSection === "hashtag" ? "bg-blue-600" : ""}
                >
                  <Hash className="w-4 h-4 mr-1" />
                  Hashtag
                </Button>
              </div>

              {/* Active Section Content */}
              <div className="bg-slate-50 rounded-lg p-4">
                <h4 className="font-semibold text-slate-900 mb-2">
                  {SEARCH_HELP[activeSection].title}
                </h4>
                <p className="text-sm text-slate-600 mb-4">
                  {SEARCH_HELP[activeSection].description}
                </p>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                      What Can Be Extracted
                    </h5>
                    <ul className="space-y-1">
                      {SEARCH_HELP[activeSection].whatCanBeExtracted.map((item, i) => (
                        <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                          <Check className="w-3 h-3 text-green-600 mt-1 flex-shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                      Best Use Cases
                    </h5>
                    <ul className="space-y-1 mb-4">
                      {SEARCH_HELP[activeSection].bestUseCases.map((item, i) => (
                        <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                          <Lightbulb className="w-3 h-3 text-amber-500 mt-1 flex-shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                    <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                      Tips
                    </h5>
                    <ul className="space-y-1">
                      {SEARCH_HELP[activeSection].tips.map((item, i) => (
                        <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                          <Info className="w-3 h-3 text-blue-500 mt-1 flex-shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* Workflow Guide */}
            <div className="border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">
                Cloudinary Upload & CSV Export Workflow
              </h3>
              <div className="bg-gradient-to-r from-blue-50 to-green-50 rounded-lg p-4">
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <div className="flex items-center gap-2 bg-white rounded-full px-3 py-1.5 shadow-sm">
                    <Search className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-medium">1. Search</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                  <div className="flex items-center gap-2 bg-white rounded-full px-3 py-1.5 shadow-sm">
                    <CheckCircle2 className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-medium">2. Select</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                  <div className="flex items-center gap-2 bg-white rounded-full px-3 py-1.5 shadow-sm">
                    <Cloud className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-medium">3. Upload</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                  <div className="flex items-center gap-2 bg-white rounded-full px-3 py-1.5 shadow-sm">
                    <FileSpreadsheet className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-medium">4. Export CSV</span>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4 text-sm">
                  <div className="bg-white rounded-lg p-3">
                    <h5 className="font-semibold text-slate-900 mb-2 flex items-center gap-2">
                      <Cloud className="w-4 h-4 text-blue-600" />
                      Cloudinary Upload
                    </h5>
                    <ul className="space-y-1 text-slate-600">
                      <li>• Videos upload to folder: <code className="bg-slate-100 px-1 rounded text-xs">"Content for Vibe Check"</code></li>
                      <li>• File naming: <code className="bg-slate-100 px-1 rounded text-xs">username_content_MMM-DD-YYYY</code></li>
                      <li>• Progress shows each video's status and file size</li>
                      <li>• Uploaded videos get green "Uploaded" badge</li>
                    </ul>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <h5 className="font-semibold text-slate-900 mb-2 flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4 text-green-600" />
                      CSV Export
                    </h5>
                    <ul className="space-y-1 text-slate-600">
                      <li>• Export button appears after upload completes</li>
                      <li>• CSV includes Cloudinary URL for each video</li>
                      <li>• All metadata columns included (16 total)</li>
                      <li>• Filename: <code className="bg-slate-100 px-1 rounded text-xs">username_MM-DD-YY_results.csv</code></li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

// Upload Progress Modal Component
function UploadProgressModal({ isOpen, onClose, uploadStatus }) {
  if (!uploadStatus) return null;

  const { total, completed, failed, items, isUploading } = uploadStatus;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
  const allDone = !isUploading && (completed + failed) === total;
  const totalSize = items
    .filter(i => i.status === "completed")
    .reduce((sum, i) => sum + (i.file_size_bytes || 0), 0);

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader className="pb-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <Cloud className={`w-6 h-6 ${allDone ? (failed > 0 ? "text-amber-600" : "text-green-600") : "text-blue-600"}`} />
            <DialogTitle className="text-lg font-semibold">
              {isUploading ? "Uploading to Cloudinary..." : (allDone ? "Upload Complete" : "Upload Status")}
            </DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">
                {isUploading ? `Uploading ${completed + 1} of ${total}...` : `${completed} of ${total} completed`}
              </span>
              <span className="font-medium text-slate-900">{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {allDone && (
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-green-50 rounded-lg text-center">
                <CheckCircle2 className="w-5 h-5 text-green-600 mx-auto mb-1" />
                <p className="text-lg font-bold text-green-700">{completed}</p>
                <p className="text-xs text-green-600">Uploaded</p>
              </div>
              {failed > 0 && (
                <div className="p-3 bg-red-50 rounded-lg text-center">
                  <XCircle className="w-5 h-5 text-red-600 mx-auto mb-1" />
                  <p className="text-lg font-bold text-red-700">{failed}</p>
                  <p className="text-xs text-red-600">Failed</p>
                </div>
              )}
              <div className="p-3 bg-blue-50 rounded-lg text-center">
                <HardDrive className="w-5 h-5 text-blue-600 mx-auto mb-1" />
                <p className="text-lg font-bold text-blue-700">{formatSize(totalSize)}</p>
                <p className="text-xs text-blue-600">Total Size</p>
              </div>
            </div>
          )}

          <ScrollArea className="h-[200px] border border-slate-200 rounded-lg">
            <div className="p-3 space-y-2">
              {items.map((item, idx) => (
                <div
                  key={item.reel_id || idx}
                  className={`flex items-center justify-between p-2 rounded-lg ${
                    item.status === "completed" ? "bg-green-50" :
                    item.status === "failed" ? "bg-red-50" :
                    item.status === "uploading" ? "bg-blue-50" :
                    "bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {item.status === "completed" && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                    {item.status === "failed" && <XCircle className="w-4 h-4 text-red-600" />}
                    {item.status === "uploading" && <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />}
                    {item.status === "pending" && <Clock className="w-4 h-4 text-slate-400" />}
                    <span className="text-sm font-medium text-slate-700">
                      Video #{idx + 1}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.status === "completed" && item.file_size_display && (
                      <Badge variant="outline" className="text-xs bg-white">
                        {item.file_size_display}
                      </Badge>
                    )}
                    {item.status === "failed" && (
                      <span className="text-xs text-red-600 max-w-[150px] truncate">
                        {item.error || "Upload failed"}
                      </span>
                    )}
                    {item.status === "completed" && item.cloudinary_url && (
                      <a
                        href={item.cloudinary_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-700"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isUploading}
            className="border-slate-200"
          >
            {isUploading ? "Uploading..." : "Close"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Execution Status Modal Component
function ExecutionStatusModal({ isOpen, onClose, executionStatus }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  if (!executionStatus) return null;

  const { status, message, error, results_count, run_id } = executionStatus;
  const isSuccess = status === "SUCCEEDED";
  const isError = status === "ERROR" || status === "FAILED" || status === "TIMED-OUT";
  const isAborted = status === "ABORTED";

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={`${isExpanded ? "max-w-4xl h-[80vh]" : "max-w-lg"} transition-all duration-300`}>
        <DialogHeader className="pb-4 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isSuccess && <CheckCircle2 className="w-6 h-6 text-green-600" />}
              {isError && <XCircle className="w-6 h-6 text-red-600" />}
              {isAborted && <AlertTriangle className="w-6 h-6 text-amber-600" />}
              <DialogTitle className="text-lg font-semibold">
                {isSuccess && "Search Completed Successfully"}
                {isError && "Search Failed"}
                {isAborted && "Search Stopped"}
              </DialogTitle>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-slate-500 hover:text-slate-700"
            >
              {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
          </div>
        </DialogHeader>

        <ScrollArea className={`${isExpanded ? "h-[calc(80vh-140px)]" : "max-h-[60vh]"}`}>
          <div className="space-y-4 p-1">
            <div className={`p-4 rounded-lg ${
              isSuccess ? "bg-green-50 border border-green-200" :
              isError ? "bg-red-50 border border-red-200" :
              "bg-amber-50 border border-amber-200"
            }`}>
              <div className="flex items-start gap-3">
                <Info className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
                  isSuccess ? "text-green-600" : isError ? "text-red-600" : "text-amber-600"
                }`} />
                <div>
                  <p className={`font-medium ${
                    isSuccess ? "text-green-800" : isError ? "text-red-800" : "text-amber-800"
                  }`}>
                    {message || (isSuccess ? "Operation completed" : "An error occurred")}
                  </p>
                  {isSuccess && results_count !== undefined && (
                    <p className="text-green-700 text-sm mt-1">
                      Retrieved {results_count} reel{results_count !== 1 ? "s" : ""} matching your criteria
                    </p>
                  )}
                </div>
              </div>
            </div>

            {error && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <Label className="text-xs text-slate-500 uppercase tracking-wide">Error Type</Label>
                    <p className="font-medium text-slate-900 mt-1">{error.error_type || "Unknown"}</p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <Label className="text-xs text-slate-500 uppercase tracking-wide">Error Code</Label>
                    <p className="font-mono text-sm text-slate-900 mt-1">{error.error_code || "N/A"}</p>
                  </div>
                </div>

                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-red-800">What happened?</p>
                      <p className="text-red-700 text-sm mt-1">{error.error_message}</p>
                    </div>
                  </div>
                </div>

                {error.possible_cause && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-amber-800">Possible Cause</p>
                        <p className="text-amber-700 text-sm mt-1">{error.possible_cause}</p>
                      </div>
                    </div>
                  </div>
                )}

                {error.suggested_solution && (
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-start gap-3">
                      <Lightbulb className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-blue-800">How to Fix</p>
                        <p className="text-blue-700 text-sm mt-1 whitespace-pre-line">{error.suggested_solution}</p>
                      </div>
                    </div>
                  </div>
                )}

                {error.technical_details && (
                  <Collapsible open={showTechnicalDetails} onOpenChange={setShowTechnicalDetails}>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" className="w-full justify-between text-slate-600 hover:text-slate-900 hover:bg-slate-100">
                        <span className="flex items-center gap-2">
                          <Code className="w-4 h-4" />
                          Technical Details
                        </span>
                        {showTechnicalDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="mt-2 p-4 bg-slate-900 rounded-lg relative">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(error.technical_details)}
                          className="absolute top-2 right-2 text-slate-400 hover:text-white h-8 px-2"
                        >
                          <Copy className="w-3 h-3 mr-1" />
                          Copy
                        </Button>
                        <pre className="text-sm text-slate-300 font-mono overflow-x-auto whitespace-pre-wrap pr-16">
                          {error.technical_details}
                        </pre>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </div>
            )}

            {run_id && (
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div>
                  <Label className="text-xs text-slate-500 uppercase tracking-wide">Run ID</Label>
                  <p className="font-mono text-sm text-slate-700 mt-1">{run_id}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => copyToClipboard(run_id)} className="text-slate-500 hover:text-slate-700">
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <Button variant="outline" onClick={onClose} className="border-slate-200">Close</Button>
          {isError && (
            <Button onClick={onClose} className="bg-blue-600 hover:bg-blue-700 text-white">Try Again</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function DashboardPage({ token, userEmail, onLogout, backendUrl }) {
  const [searchType, setSearchType] = useState("username");
  const [usernames, setUsernames] = useState([""]);
  const [urlInput, setUrlInput] = useState("");
  const [hashtagInput, setHashtagInput] = useState("");
  const [maxResults, setMaxResults] = useState(25);
  const [dateMode, setDateMode] = useState("recent");
  
  const [searching, setSearching] = useState(false);
  const [runId, setRunId] = useState(null);
  const [progress, setProgress] = useState(0);
  const [estimatedTime, setEstimatedTime] = useState(0);
  const pollIntervalRef = useRef(null);

  const [showStatusModal, setShowStatusModal] = useState(false);
  const [executionStatus, setExecutionStatus] = useState(null);

  const [results, setResults] = useState([]);
  const [message, setMessage] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [expandedTranscripts, setExpandedTranscripts] = useState(new Set());

  const [uploading, setUploading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [uploadedReelIds, setUploadedReelIds] = useState(new Set());

  const [exporting, setExporting] = useState(false);

  const api = axios.create({
    baseURL: `${backendUrl}/api`,
    headers: { Authorization: `Bearer ${token}` },
  });

  const estimatedCost = ((maxResults / 1000) * 2.6).toFixed(2);
  const totalPages = Math.ceil(results.length / RESULTS_PER_PAGE);
  const paginatedResults = results.slice((currentPage - 1) * RESULTS_PER_PAGE, currentPage * RESULTS_PER_PAGE);
  const hasUploadedSelected = Array.from(selectedIds).some(id => uploadedReelIds.has(id));
  const allSelectedUploaded = selectedIds.size > 0 && Array.from(selectedIds).every(id => uploadedReelIds.has(id));

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const addUsernameField = () => {
    if (usernames.length < MAX_USERNAME_FIELDS) setUsernames([...usernames, ""]);
  };

  const removeUsernameField = (index) => {
    if (usernames.length > 1) setUsernames(usernames.filter((_, i) => i !== index));
  };

  const updateUsername = (index, value) => {
    const newUsernames = [...usernames];
    newUsernames[index] = value;
    setUsernames(newUsernames);
  };

  const showExecutionResult = (status, message, error = null, resultsCount = 0, searchRunId = null) => {
    setExecutionStatus({ status, message, error, results_count: resultsCount, run_id: searchRunId });
    setShowStatusModal(true);
  };

  const pollSearchStatus = async (searchRunId) => {
    try {
      const response = await api.get(`/reels/search/status/${searchRunId}`);
      const { status, progress: prog, estimated_seconds_remaining, results: searchResults, total, message: msg, error } = response.data;
      
      setProgress(prog);
      setEstimatedTime(estimated_seconds_remaining);
      
      if (status === "SUCCEEDED") {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
        setSearching(false);
        setRunId(null);
        setResults(searchResults || []);
        setProgress(100);
        setUploadedReelIds(new Set());
        showExecutionResult("SUCCEEDED", msg || `Successfully retrieved ${total} reels`, null, total, searchRunId);
      } else if (status === "FAILED" || status === "TIMED-OUT") {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
        setSearching(false);
        setRunId(null);
        setProgress(0);
        showExecutionResult(status, msg, error, 0, searchRunId);
      } else if (status === "ABORTED") {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
        setSearching(false);
        setRunId(null);
        setProgress(0);
        showExecutionResult("ABORTED", "Search was stopped by user", null, 0, searchRunId);
      }
    } catch (error) {
      console.error("Poll error:", error);
    }
  };

  const handleSearch = async () => {
    let payload = { search_type: searchType, max_results: maxResults };

    if (searchType === "username") {
      const validUsernames = usernames.map((u) => u.trim().replace(/^@/, "")).filter((u) => u);
      if (validUsernames.length === 0) { toast.error("Please enter at least one username"); return; }
      payload.usernames = validUsernames;
    } else if (searchType === "url") {
      const urls = urlInput.split("\n").map((u) => u.trim()).filter((u) => u);
      if (urls.length === 0) { toast.error("Please enter at least one URL"); return; }
      payload.urls = urls;
    } else if (searchType === "hashtag") {
      const hashtag = hashtagInput.replace(/^#/, "").trim();
      if (!hashtag) { toast.error("Please enter a hashtag"); return; }
      payload.hashtag = hashtag;
    }

    setSearching(true);
    setMessage("");
    setResults([]);
    setSelectedIds(new Set());
    setUploadedReelIds(new Set());
    setCurrentPage(1);
    setProgress(0);
    setEstimatedTime(maxResults * 2.5);

    try {
      const response = await api.post("/reels/search/start", payload);
      const { run_id, status, message: msg, error } = response.data;
      
      if (status === "NOT_SUPPORTED") {
        setSearching(false);
        setMessage(msg);
        showExecutionResult("NOT_SUPPORTED", msg, {
          error_type: "NOT_SUPPORTED", error_message: msg, error_code: "ACTOR_LIMITATION",
          possible_cause: "The current Apify actor does not support this search mode",
          suggested_solution: "Use Username or Hashtag mode instead.",
          technical_details: `Search type: ${searchType}`
        }, 0, null);
        return;
      }
      
      if (status === "CACHED") {
        setRunId(run_id);
        toast.success("Found cached results!");
        pollSearchStatus(run_id);
        return;
      }
      
      if (status === "ERROR") {
        setSearching(false);
        showExecutionResult("ERROR", msg, error, 0, null);
        return;
      }
      
      setRunId(run_id);
      toast.info("Search started...");
      pollIntervalRef.current = setInterval(() => pollSearchStatus(run_id), 3000);
      
    } catch (error) {
      setSearching(false);
      const msg = error.response?.data?.detail || "Search failed";
      showExecutionResult("ERROR", msg, {
        error_type: "REQUEST_FAILED", error_message: msg, error_code: "NETWORK_ERROR",
        possible_cause: "Failed to communicate with the server",
        suggested_solution: "Check your internet connection and try again.",
        technical_details: error.message
      }, 0, null);
    }
  };

  const handleStopSearch = async () => {
    if (!runId) return;
    try {
      await api.post(`/reels/search/stop/${runId}`);
      if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
      setSearching(false);
      const stoppedRunId = runId;
      setRunId(null);
      setProgress(0);
      showExecutionResult("ABORTED", "Search was stopped by user", null, 0, stoppedRunId);
    } catch (error) {
      toast.error("Failed to stop search");
    }
  };

  const toggleSelect = (id) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedIds(newSelected);
  };

  const selectAll = () => {
    if (selectedIds.size === results.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(results.map((r) => r.id)));
  };

  const toggleTranscript = (id) => {
    const newExpanded = new Set(expandedTranscripts);
    if (newExpanded.has(id)) newExpanded.delete(id);
    else newExpanded.add(id);
    setExpandedTranscripts(newExpanded);
  };

  const handleUpload = async () => {
    const selected = results.filter((r) => selectedIds.has(r.id));
    if (selected.length === 0) { toast.error("Please select at least one reel to upload"); return; }

    const initialItems = selected.map((r, idx) => ({
      reel_id: r.id, status: idx === 0 ? "uploading" : "pending", progress: 0,
      cloudinary_url: "", cloudinary_public_id: "", file_size_bytes: 0, file_size_display: "", error: ""
    }));

    setUploadStatus({ total: selected.length, completed: 0, failed: 0, items: initialItems, isUploading: true });
    setShowUploadModal(true);
    setUploading(true);

    try {
      const response = await api.post("/reels/upload", { reel_ids: selected.map((r) => r.id), reels: selected });
      const { total, completed, failed, items } = response.data;
      
      const newUploadedIds = new Set(uploadedReelIds);
      if (items && items.length > 0) {
        setResults((prev) => prev.map((r) => {
          const uploadedItem = items.find((u) => u.reel_id === r.id && u.status === "completed");
          if (uploadedItem) {
            newUploadedIds.add(r.id);
            return { ...r, cloudinary_url: uploadedItem.cloudinary_url, cloudinary_public_id: uploadedItem.cloudinary_public_id };
          }
          return r;
        }));
        setUploadedReelIds(newUploadedIds);
      }

      setUploadStatus({ total, completed, failed, items, isUploading: false });
      if (completed > 0) toast.success(`Uploaded ${completed} video${completed > 1 ? 's' : ''} to Cloudinary`);
      if (failed > 0) toast.error(`${failed} upload${failed > 1 ? 's' : ''} failed`);
    } catch (error) {
      toast.error("Upload failed");
      setUploadStatus(prev => ({ ...prev, isUploading: false, items: prev?.items?.map(i => ({...i, status: "failed", error: "Request failed"})) || [] }));
    } finally {
      setUploading(false);
    }
  };

  const handleExport = async () => {
    const toExport = results.filter((r) => selectedIds.has(r.id) && uploadedReelIds.has(r.id));
    if (toExport.length === 0) { toast.error("No uploaded reels to export. Upload to Cloudinary first."); return; }

    setExporting(true);
    try {
      const response = await api.post("/reels/export", { reels: toExport, selected_only: true }, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      const contentDisposition = response.headers["content-disposition"];
      let filename = "reels_export.csv";
      if (contentDisposition) { const match = contentDisposition.match(/filename=(.+)/); if (match) filename = match[1]; }
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Exported ${toExport.length} reels with Cloudinary URLs`);
    } catch (error) {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  };

  const formatTime = (seconds) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-white">
        <ExecutionStatusModal isOpen={showStatusModal} onClose={() => setShowStatusModal(false)} executionStatus={executionStatus} />
        <UploadProgressModal isOpen={showUploadModal} onClose={() => !uploading && setShowUploadModal(false)} uploadStatus={uploadStatus} />

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
                <User className="w-3 h-3 mr-1" />{userEmail}
              </Badge>
              <Button variant="ghost" size="sm" onClick={onLogout} className="text-slate-600 hover:text-slate-900" data-testid="logout-btn">
                <LogOut className="w-4 h-4 mr-2" />Sign Out
              </Button>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-6 py-8">
          {/* Help Panel */}
          <HelpPanel />

          {/* Search Section */}
          <Card className="border-slate-200 shadow-sm mb-8 animate-fade-in">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <Search className="w-5 h-5 text-blue-600" />
                Search Reels
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <Tabs value={searchType} onValueChange={setSearchType}>
                <TabsList className="bg-slate-100 p-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <TabsTrigger value="username" className="data-[state=active]:bg-white data-[state=active]:text-blue-600" data-testid="tab-username">
                        <User className="w-4 h-4 mr-2" />Username
                        <HelpCircle className="w-3 h-3 ml-1 text-slate-400" />
                      </TabsTrigger>
                    </TooltipTrigger>
                    <TooltipContent><p className="max-w-xs">{SEARCH_HELP.username.tooltip}</p></TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <TabsTrigger value="url" className="data-[state=active]:bg-white data-[state=active]:text-blue-600" data-testid="tab-url">
                        <LinkIcon className="w-4 h-4 mr-2" />Profile URL
                        <HelpCircle className="w-3 h-3 ml-1 text-slate-400" />
                      </TabsTrigger>
                    </TooltipTrigger>
                    <TooltipContent><p className="max-w-xs">{SEARCH_HELP.url.tooltip}</p></TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <TabsTrigger value="hashtag" className="data-[state=active]:bg-white data-[state=active]:text-blue-600" data-testid="tab-hashtag">
                        <Hash className="w-4 h-4 mr-2" />Hashtag
                        <HelpCircle className="w-3 h-3 ml-1 text-slate-400" />
                      </TabsTrigger>
                    </TooltipTrigger>
                    <TooltipContent><p className="max-w-xs">{SEARCH_HELP.hashtag.tooltip}</p></TooltipContent>
                  </Tooltip>
                </TabsList>

                <TabsContent value="username" className="mt-4 space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-slate-700 font-medium">Instagram Username(s)</Label>
                      <span className="text-xs text-slate-400">{usernames.length}/{MAX_USERNAME_FIELDS} fields • underscores allowed</span>
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
                    {usernames.length < MAX_USERNAME_FIELDS && (
                      <Button type="button" variant="outline" size="sm" onClick={addUsernameField} className="mt-2 border-dashed border-slate-300 text-slate-600 hover:border-blue-400 hover:text-blue-600" data-testid="add-username-btn">
                        <Plus className="w-4 h-4 mr-1" />Add Username
                      </Button>
                    )}
                  </div>
                  <div>
                    <Label className="text-slate-700 font-medium mb-2 block">Date Filter</Label>
                    <Button type="button" variant="default" size="sm" className="bg-blue-600 hover:bg-blue-700">
                      <Clock className="w-4 h-4 mr-1" />Most Recent
                    </Button>
                    <p className="text-xs text-slate-500 mt-1">Retrieves the most recent reels up to your selected max results</p>
                  </div>
                </TabsContent>

                <TabsContent value="url" className="mt-4 space-y-4">
                  <div>
                    <Label className="text-slate-700 font-medium">Instagram Profile URL(s)</Label>
                    <p className="text-sm text-slate-500 mb-2">Enter profile URLs (one per line) - we'll extract usernames and find their reels</p>
                    <Textarea placeholder="https://www.instagram.com/natgeo&#10;https://www.instagram.com/nike&#10;https://www.instagram.com/my_date_jar" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} className="h-24 border-slate-200 focus:border-blue-500 font-mono text-sm" data-testid="url-input" />
                    <p className="text-xs text-slate-400 mt-1">Supports formats: instagram.com/username or just the username</p>
                  </div>
                </TabsContent>

                <TabsContent value="hashtag" className="mt-4 space-y-4">
                  <div>
                    <Label className="text-slate-700 font-medium">Hashtag</Label>
                    <p className="text-sm text-slate-500 mb-2">Enter hashtag with or without #</p>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">#</span>
                      <Input placeholder="datenight" value={hashtagInput} onChange={(e) => setHashtagInput(e.target.value)} className="h-10 pl-8 border-slate-200 focus:border-blue-500" data-testid="hashtag-input" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-slate-700 font-medium mb-2 block">Date Filter</Label>
                    <Button type="button" variant="default" size="sm" className="bg-blue-600 hover:bg-blue-700">
                      <Clock className="w-4 h-4 mr-1" />Most Recent
                    </Button>
                    <p className="text-xs text-slate-500 mt-1">Retrieves the most recent reels up to your selected max results</p>
                  </div>
                </TabsContent>
              </Tabs>

              <div className="flex flex-wrap items-end gap-4 pt-4 border-t border-slate-100">
                <div className="min-w-[160px]">
                  <Label className="text-slate-700 font-medium">Max Results</Label>
                  <Select value={maxResults.toString()} onValueChange={(v) => setMaxResults(parseInt(v))}>
                    <SelectTrigger className="mt-2 h-10 border-slate-200" data-testid="max-results-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MAX_RESULTS_OPTIONS.map((opt) => (<SelectItem key={opt} value={opt.toString()}>{opt} results</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
                  <DollarSign className="w-4 h-4 text-amber-600" />
                  <div>
                    <p className="text-xs text-amber-700 font-medium">Est. Cost</p>
                    <p className="text-base font-bold text-amber-900">${estimatedCost}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {!searching ? (
                    <Button onClick={handleSearch} className="h-10 px-6 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-full transition-colors" data-testid="run-search-btn">
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
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                      <span className="text-sm font-medium text-blue-800">Searching Instagram...</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-blue-700">
                      <span className="font-medium">{progress}%</span>
                      {estimatedTime > 0 && <span className="text-blue-600">~{formatTime(estimatedTime)} remaining</span>}
                    </div>
                  </div>
                  <Progress value={progress} className="h-2" />
                  <p className="text-xs text-blue-600 mt-2">Fetching up to {maxResults} reels. You can stop anytime to get partial results.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {message && (
            <div className="mb-6 flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg animate-fade-in">
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <p className="text-blue-800 text-sm">{message}</p>
            </div>
          )}

          {results.length > 0 && (
            <div className="animate-fade-in">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-4">
                  <h2 className="text-lg font-semibold text-slate-900">Results ({results.length})</h2>
                  <div className="flex items-center gap-2">
                    <Checkbox checked={selectedIds.size === results.length && results.length > 0} onCheckedChange={selectAll} data-testid="select-all-checkbox" />
                    <span className="text-sm text-slate-600">Select all ({selectedIds.size} selected)</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setResults([]);
                      setSelectedIds(new Set());
                      setUploadedReelIds(new Set());
                      setCurrentPage(1);
                      setMessage("");
                      toast.info("Results cleared");
                    }}
                    className="text-slate-500 hover:text-red-600 hover:bg-red-50"
                    data-testid="clear-results-btn"
                  >
                    <X className="w-4 h-4 mr-1" />
                    Clear Results
                  </Button>
                </div>

                <div className="flex items-center gap-3">
                  <Button size="sm" onClick={handleUpload} disabled={uploading || selectedIds.size === 0} className="bg-blue-600 hover:bg-blue-700 text-white" data-testid="upload-cloudinary-btn">
                    {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Cloud className="w-4 h-4 mr-2" />}
                    Upload to Cloudinary
                  </Button>

                  {hasUploadedSelected && (
                    <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting || !allSelectedUploaded} className="border-slate-200 text-slate-700 hover:bg-slate-50" data-testid="export-csv-btn">
                      {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                      Export CSV
                      {!allSelectedUploaded && selectedIds.size > 0 && <Badge variant="outline" className="ml-2 text-xs">Upload first</Badge>}
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                {paginatedResults.map((reel, index) => (
                  <ReelRow key={reel.id} reel={reel} isSelected={selectedIds.has(reel.id)} onToggleSelect={() => toggleSelect(reel.id)} isExpanded={expandedTranscripts.has(reel.id)} onToggleTranscript={() => toggleTranscript(reel.id)} isUploaded={uploadedReelIds.has(reel.id)} index={(currentPage - 1) * RESULTS_PER_PAGE + index + 1} />
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-8">
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="border-slate-200" data-testid="prev-page-btn">
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                      let page;
                      if (totalPages <= 7) page = i + 1;
                      else if (currentPage <= 4) page = i + 1;
                      else if (currentPage >= totalPages - 3) page = totalPages - 6 + i;
                      else page = currentPage - 3 + i;
                      return (
                        <Button key={page} variant={page === currentPage ? "default" : "outline"} size="sm" onClick={() => setCurrentPage(page)} className={page === currentPage ? "bg-blue-600 text-white" : "border-slate-200 text-slate-700"} data-testid={`page-${page}-btn`}>
                          {page}
                        </Button>
                      );
                    })}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="border-slate-200" data-testid="next-page-btn">
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </TooltipProvider>
  );
}

function ReelRow({ reel, isSelected, onToggleSelect, isExpanded, onToggleTranscript, isUploaded, index }) {
  const videoUrl = reel.downloaded_video_url || reel.original_video_url;
  const truncatedTranscript = reel.video_transcript?.length > 100 ? reel.video_transcript.slice(0, 100) + "..." : reel.video_transcript;

  return (
    <Card className={`border-slate-200 overflow-hidden hover-lift ${isUploaded ? 'ring-2 ring-green-200' : ''}`} data-testid={`reel-row-${index}`}>
      <div className="flex flex-col lg:flex-row">
        <div className="lg:w-72 flex-shrink-0 bg-slate-900 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <Checkbox checked={isSelected} onCheckedChange={onToggleSelect} data-testid={`select-reel-${index}`} />
              <span className="text-white text-sm font-medium">#{index}</span>
            </div>
            {isUploaded && <Badge className="bg-green-500 text-white text-xs"><Check className="w-3 h-3 mr-1" />Uploaded</Badge>}
          </div>
          {videoUrl ? (
            <video src={videoUrl} controls className="w-full aspect-[9/16] max-h-[280px] object-contain rounded-lg" preload="metadata" data-testid={`video-player-${index}`}>Your browser does not support the video tag.</video>
          ) : (
            <div className="w-full aspect-[9/16] max-h-[280px] bg-slate-800 rounded-lg flex items-center justify-center"><p className="text-slate-400 text-sm">No video available</p></div>
          )}
        </div>

        <div className="flex-1 p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-slate-500 uppercase tracking-wide">Owner</Label>
              <p className="font-semibold text-slate-900">@{reel.owner_username}</p>
              {reel.owner_full_name && <p className="text-sm text-slate-600">{reel.owner_full_name}</p>}
            </div>
            <div>
              <Label className="text-xs text-slate-500 uppercase tracking-wide">Duration</Label>
              <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-slate-400" /><span className="text-slate-900">{reel.video_duration_seconds}s</span></div>
            </div>
            <div>
              <Label className="text-xs text-slate-500 uppercase tracking-wide">Posted</Label>
              <p className="text-slate-900">{reel.timestamp || "N/A"}</p>
            </div>
            <div>
              <Label className="text-xs text-slate-500 uppercase tracking-wide">Reel URL</Label>
              <a href={reel.reel_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700 text-sm flex items-center gap-1">View on Instagram<ExternalLink className="w-3 h-3" /></a>
            </div>
            {(reel.music_artist || reel.music_song) && (
              <div className="md:col-span-2">
                <Label className="text-xs text-slate-500 uppercase tracking-wide">Music</Label>
                <div className="flex items-center gap-2 text-slate-700">
                  <Music className="w-4 h-4 text-slate-400" />
                  <span>{reel.music_song || "Unknown"} - {reel.music_artist || "Unknown"}{reel.music_original_audio && <Badge variant="outline" className="ml-2 text-xs">Original</Badge>}</span>
                </div>
              </div>
            )}
            {reel.tagged_users?.length > 0 && (
              <div className="md:col-span-2">
                <Label className="text-xs text-slate-500 uppercase tracking-wide">Tagged Users</Label>
                <div className="flex items-center gap-2 flex-wrap mt-1">
                  <Users className="w-4 h-4 text-slate-400" />
                  {reel.tagged_users.map((user, i) => <Badge key={i} variant="secondary" className="text-xs">@{user}</Badge>)}
                </div>
              </div>
            )}
            {reel.video_transcript && (
              <div className="md:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-xs text-slate-500 uppercase tracking-wide">Transcript</Label>
                  {reel.video_transcript.length > 100 && (
                    <Button variant="ghost" size="sm" onClick={onToggleTranscript} className="text-blue-600 text-xs h-6 px-2">
                      {isExpanded ? <><ChevronUp className="w-3 h-3 mr-1" /> Collapse</> : <><ChevronDown className="w-3 h-3 mr-1" /> Expand</>}
                    </Button>
                  )}
                </div>
                <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg">{isExpanded ? reel.video_transcript : truncatedTranscript}</p>
              </div>
            )}
            {reel.cloudinary_url && (
              <div className="md:col-span-2">
                <Label className="text-xs text-slate-500 uppercase tracking-wide">Cloudinary</Label>
                <div className="flex items-center gap-2">
                  <Badge className="bg-green-100 text-green-700 hover:bg-green-100"><Check className="w-3 h-3 mr-1" />Uploaded</Badge>
                  <a href={reel.cloudinary_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700 text-sm flex items-center gap-1">View on Cloudinary<ExternalLink className="w-3 h-3" /></a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
