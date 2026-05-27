import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Download, Cloud, X, ChevronLeft, ChevronRight, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { ReelCard } from "@/components/ReelCard";

const RESULTS_PER_PAGE = 10;

export function ResultsGrid({
  results, setResults,
  selectedIds, setSelectedIds,
  uploadedReelIds, setUploadedReelIds,
  expandedTranscripts, toggleTranscript,
  currentPage, setCurrentPage,
  uploading, onUpload,
  exporting, onExport,
  setMessage,
}) {
  if (!results.length) return null;

  const totalPages = Math.ceil(results.length / RESULTS_PER_PAGE);
  const paginated = results.slice((currentPage - 1) * RESULTS_PER_PAGE, currentPage * RESULTS_PER_PAGE);

  const toggleSelect = (id) => {
    const n = new Set(selectedIds);
    if (n.has(id)) n.delete(id); else n.add(id);
    setSelectedIds(n);
  };
  const selectAll = () => {
    if (selectedIds.size === results.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(results.map(r => r.id)));
  };
  const clearResults = () => {
    setResults([]); setSelectedIds(new Set()); setUploadedReelIds(new Set());
    setCurrentPage(1); setMessage("");
    toast.info("Results cleared");
  };

  return (
    <div className="animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-slate-900">Results ({results.length})</h2>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={selectedIds.size === results.length && results.length > 0}
              onCheckedChange={selectAll}
              data-testid="select-all-checkbox"
            />
            <span className="text-sm text-slate-600">Select all ({selectedIds.size} selected)</span>
          </div>
          <Button
            variant="ghost" size="sm" onClick={clearResults}
            className="text-slate-500 hover:text-red-600 hover:bg-red-50"
            data-testid="clear-results-btn"
          >
            <X className="w-4 h-4 mr-1" />Clear Results
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <Button
            size="sm" onClick={onUpload}
            disabled={uploading || selectedIds.size === 0}
            className="bg-blue-600 hover:bg-blue-700 text-white"
            data-testid="upload-cloudinary-btn"
          >
            {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Cloud className="w-4 h-4 mr-2" />}
            Upload to Cloudinary
          </Button>
          <Button
            variant="outline" size="sm" onClick={onExport}
            disabled={exporting || selectedIds.size === 0}
            className="border-slate-200 text-slate-700 hover:bg-slate-50"
            data-testid="export-csv-btn"
          >
            {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            Export CSV ({selectedIds.size})
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {paginated.map((reel, index) => (
          <ReelCard
            key={reel.id} reel={reel}
            isSelected={selectedIds.has(reel.id)}
            onToggleSelect={() => toggleSelect(reel.id)}
            isExpanded={expandedTranscripts.has(reel.id)}
            onToggleTranscript={() => toggleTranscript(reel.id)}
            isUploaded={uploadedReelIds.has(reel.id)}
            index={(currentPage - 1) * RESULTS_PER_PAGE + index + 1}
          />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          <Button variant="outline" size="sm"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1} className="border-slate-200" data-testid="prev-page-btn">
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
                <Button
                  key={page}
                  variant={page === currentPage ? "default" : "outline"}
                  size="sm" onClick={() => setCurrentPage(page)}
                  className={page === currentPage ? "bg-blue-600 text-white" : "border-slate-200 text-slate-700"}
                  data-testid={`page-${page}-btn`}
                >
                  {page}
                </Button>
              );
            })}
          </div>
          <Button variant="outline" size="sm"
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages} className="border-slate-200" data-testid="next-page-btn">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
