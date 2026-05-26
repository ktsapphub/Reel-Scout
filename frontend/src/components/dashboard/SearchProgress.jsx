import { Progress } from "@/components/ui/progress";
import { Loader2, Search, Filter, CheckCircle2, Square, Sparkles } from "lucide-react";

function formatTime(seconds) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

/**
 * Stages reflect the user-visible search lifecycle.
 *  1. Starting   — request sent, run_id received, no progress yet
 *  2. Scraping   — items_processed growing
 *  3. Filtering  — progress >= 90 (Apify done, server processing results)
 *  4. Complete   — final SUCCEEDED / partial result returned
 */
function getStage({ progress, itemsProcessed, searching }) {
  if (!searching) return "complete";
  if (progress < 5 && itemsProcessed === 0) return "starting";
  if (progress >= 90) return "filtering";
  return "scraping";
}

const STAGES = [
  { id: "starting",  icon: Loader2,       label: "Starting" },
  { id: "scraping",  icon: Search,        label: "Scraping" },
  { id: "filtering", icon: Filter,        label: "Filtering" },
  { id: "complete",  icon: CheckCircle2,  label: "Complete" },
];

export function SearchProgress({
  searching, progress, estimatedTime, itemsProcessed, maxResults,
}) {
  if (!searching) return null;

  const stage = getStage({ progress, itemsProcessed, searching });
  const currentIndex = STAGES.findIndex(s => s.id === stage);

  const stageSubtitle = (() => {
    if (stage === "starting") return "Connecting to Apify…";
    if (stage === "scraping") return itemsProcessed > 0
      ? `Sifting through ${itemsProcessed} items collected so far`
      : `Fetching up to ${maxResults} reels`;
    if (stage === "filtering") return "Filtering reels (skipping non-video posts, applying date range)…";
    return "Done";
  })();

  return (
    <div
      className="p-4 bg-gradient-to-br from-blue-50 to-slate-50 border border-blue-200 rounded-xl animate-fade-in"
      data-testid="search-progress"
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Sparkles className="w-4 h-4 text-blue-600" />
            <span className="absolute inset-0 w-4 h-4 animate-ping opacity-50">
              <Sparkles className="w-4 h-4 text-blue-400" />
            </span>
          </div>
          <span className="text-sm font-semibold text-slate-800">Searching Instagram</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-blue-700 font-medium">{progress}%</span>
          {estimatedTime > 0 && (
            <span className="text-slate-500">~{formatTime(estimatedTime)} left</span>
          )}
          <span className="text-slate-400 hidden sm:inline">·</span>
          <span className="text-slate-500 hidden sm:inline flex items-center gap-1">
            <Square className="w-3 h-3" />Stop to keep partial
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <Progress value={progress} className="h-2 mb-3" />

      {/* Stage timeline */}
      <div className="flex items-center justify-between mb-3" data-testid="search-stages">
        {STAGES.map((s, idx) => {
          const isDone = idx < currentIndex;
          const isActive = idx === currentIndex;
          const Icon = s.icon;
          return (
            <div key={s.id} className="flex items-center flex-1">
              <div
                className={`flex items-center gap-1.5 ${isActive ? "text-blue-700" : isDone ? "text-emerald-700" : "text-slate-400"}`}
                data-testid={`stage-${s.id}`}
                data-state={isActive ? "active" : isDone ? "done" : "pending"}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${isActive ? "bg-blue-100 ring-2 ring-blue-400 ring-offset-1" : isDone ? "bg-emerald-100" : "bg-slate-100"}`}>
                  <Icon className={`w-3.5 h-3.5 ${isActive ? "animate-spin" : ""}`} />
                </div>
                <span className="text-xs font-medium hidden sm:inline">{s.label}</span>
              </div>
              {idx < STAGES.length - 1 && (
                <div className={`flex-1 h-px mx-2 ${idx < currentIndex ? "bg-emerald-300" : "bg-slate-200"}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Stage detail subtitle */}
      <div className="flex items-center justify-between pt-2 border-t border-blue-100">
        <p className="text-xs text-slate-600">{stageSubtitle}</p>
        {itemsProcessed > 0 && (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-500">discovered</span>
            <span className="text-base font-bold text-blue-700 tabular-nums" data-testid="items-discovered">
              {itemsProcessed}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
