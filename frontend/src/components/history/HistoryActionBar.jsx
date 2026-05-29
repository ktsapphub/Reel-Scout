import { useState, useMemo } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Loader2, Cloud, Download, CheckSquare, Square } from "lucide-react";
import { toast } from "sonner";

/**
 * Bulk action bar that lives on each History row + the expanded modal.
 * Lets users select reels from a previously cached search, then upload them
 * to Cloudinary or export them as CSV — without going back to Dashboard.
 */
export function HistoryActionBar({ token, backendUrl, reels, cacheKey }) {
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [busy, setBusy] = useState(null); // "upload" | "export" | null

  const api = useMemo(() => axios.create({
    baseURL: `${backendUrl}/api`,
    headers: { Authorization: `Bearer ${token}` },
  }), [backendUrl, token]);

  const allSelected = reels.length > 0 && selectedIds.size === reels.length;
  const someSelected = selectedIds.size > 0;
  const uploadedSet = useMemo(
    () => new Set(reels.filter((r) => r.cloudinary_url).map((r) => r.id || r.reel_url)),
    [reels],
  );
  const unUploaded = reels.filter((r) => !r.cloudinary_url).length;

  const toggleAll = () => {
    if (allSelected) { setSelectedIds(new Set()); return; }
    setSelectedIds(new Set(reels.map((r) => r.id || r.reel_url)));
  };

  const toggleUnuploadedOnly = () => {
    const ids = reels.filter((r) => !r.cloudinary_url).map((r) => r.id || r.reel_url);
    setSelectedIds(new Set(ids));
  };

  const toggleOne = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleUpload = async () => {
    const toUpload = reels.filter((r) => selectedIds.has(r.id || r.reel_url) && !r.cloudinary_url);
    if (!toUpload.length) {
      toast.info("All selected reels are already in Cloudinary");
      return;
    }
    setBusy("upload");
    try {
      const response = await api.post("/reels/upload", { reels: toUpload });
      const items = response.data?.upload?.items || response.data?.items || [];
      const ok = items.filter((i) => i.status === "completed").length;
      const failed = items.length - ok;
      toast.success(`Uploaded ${ok}/${items.length} to Cloudinary${failed ? ` (${failed} failed)` : ""}`);
      // Optimistically mark uploaded so badges update without reload
      items.forEach((i) => {
        if (i.status === "completed") {
          const reel = reels.find((r) => r.id === i.reel_id);
          if (reel) reel.cloudinary_url = i.cloudinary_url;
        }
      });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Upload failed");
    } finally { setBusy(null); }
  };

  const handleExport = async () => {
    const toExport = reels.filter((r) => selectedIds.has(r.id || r.reel_url));
    if (!toExport.length) { toast.error("Select at least one reel to export"); return; }
    setBusy("export");
    try {
      const response = await api.post(
        "/reels/export",
        { reels: toExport, selected_only: true },
        { responseType: "blob" },
      );
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      const cd = response.headers["content-disposition"];
      link.setAttribute("download", cd?.match(/filename=(.+)/)?.[1] || `history_${cacheKey || "export"}.csv`);
      document.body.appendChild(link); link.click(); link.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Exported ${toExport.length} reels to CSV`);
      // Mark as exported optimistically
      toExport.forEach((r) => { r.exported_at = new Date().toISOString(); });
    } catch {
      toast.error("Export failed");
    } finally { setBusy(null); }
  };

  return {
    selectedIds, toggleOne, uploadedSet,
    bar: (
      <div
        className="flex items-center justify-between gap-3 flex-wrap py-2.5 px-3 bg-slate-50 rounded-lg border border-slate-200"
        data-testid="history-action-bar"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="ghost" size="sm" onClick={toggleAll}
            className="h-7 px-2 text-xs"
            data-testid="history-select-all"
          >
            {allSelected
              ? <CheckSquare className="w-3.5 h-3.5 mr-1 text-blue-600" />
              : <Square className="w-3.5 h-3.5 mr-1 text-slate-400" />}
            {allSelected ? "Deselect all" : "Select all"} ({reels.length})
          </Button>
          {unUploaded > 0 && (
            <Button
              variant="ghost" size="sm" onClick={toggleUnuploadedOnly}
              className="h-7 px-2 text-xs text-slate-600"
              data-testid="history-select-unuploaded"
            >
              Select not-yet-uploaded ({unUploaded})
            </Button>
          )}
          <span className="text-xs text-slate-500 ml-1">
            {someSelected ? `${selectedIds.size} selected` : "Pick reels to upload or export"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm" onClick={handleUpload}
            disabled={!someSelected || busy === "upload"}
            className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 px-3"
            data-testid="history-upload-btn"
          >
            {busy === "upload"
              ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              : <Cloud className="w-3.5 h-3.5 mr-1.5" />}
            Upload to Cloudinary
          </Button>
          <Button
            size="sm" variant="outline" onClick={handleExport}
            disabled={!someSelected || busy === "export"}
            className="h-8 px-3 border-blue-200 text-blue-700 hover:bg-blue-50"
            data-testid="history-export-btn"
          >
            {busy === "export"
              ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              : <Download className="w-3.5 h-3.5 mr-1.5" />}
            Export CSV
          </Button>
        </div>
      </div>
    ),
  };
}
