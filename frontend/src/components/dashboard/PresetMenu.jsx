import { useEffect, useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Bookmark, BookmarkPlus, Trash2, ChevronDown, Loader2, Hash, User, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";
import axios from "axios";

const TYPE_ICONS = { username: User, url: LinkIcon, hashtag: Hash };

export function PresetMenu({ token, backendUrl, currentConfig, onApply }) {
  const [presets, setPresets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const api = useMemo(() => axios.create({
    baseURL: `${backendUrl}/api`,
    headers: { Authorization: `Bearer ${token}` },
  }), [backendUrl, token]);

  const fetchPresets = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get("/presets");
      setPresets(response.data.presets || []);
    } catch {
      // silent — non-critical
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { fetchPresets(); }, [fetchPresets]);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) { toast.error("Enter a preset name"); return; }
    setSaving(true);
    try {
      await api.post("/presets", { name: trimmed, config: currentConfig });
      toast.success(`Saved preset "${trimmed}"`);
      setName("");
      setSaveOpen(false);
      await fetchPresets();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to save preset");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (preset, e) => {
    e?.stopPropagation();
    e?.preventDefault();
    setDeletingId(preset.id);
    try {
      await api.delete(`/presets/${preset.id}`);
      toast.success(`Deleted "${preset.name}"`);
      setPresets((prev) => prev.filter((p) => p.id !== preset.id));
    } catch {
      toast.error("Failed to delete preset");
    } finally {
      setDeletingId(null);
    }
  };

  const handleApply = (preset) => {
    onApply(preset.config || {});
    toast.success(`Loaded "${preset.name}"`);
  };

  return (
    <div className="flex items-center gap-2" data-testid="preset-menu">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline" size="sm"
            className="h-8 border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-300"
            data-testid="presets-dropdown-trigger"
          >
            <Bookmark className="w-3.5 h-3.5 mr-1.5" />
            Presets
            {presets.length > 0 && (
              <span className="ml-1.5 text-[10px] text-slate-400">({presets.length})</span>
            )}
            <ChevronDown className="w-3 h-3 ml-1.5 text-slate-400" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72" data-testid="presets-dropdown-content">
          <DropdownMenuLabel className="text-xs font-semibold text-slate-700">
            Saved Search Presets
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
            </div>
          ) : presets.length === 0 ? (
            <p className="px-3 py-4 text-xs text-slate-500 text-center">
              No presets yet. Configure a search, then click <span className="font-semibold">Save current</span>.
            </p>
          ) : (
            <div className="max-h-72 overflow-y-auto py-1">
              {presets.map((p) => {
                const TypeIcon = TYPE_ICONS[p.config?.searchType] || Bookmark;
                return (
                  <DropdownMenuItem
                    key={p.id}
                    onSelect={(e) => { e.preventDefault(); handleApply(p); }}
                    className="cursor-pointer flex items-center gap-2 group"
                    data-testid={`preset-item-${p.id}`}
                  >
                    <TypeIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-800 truncate">{p.name}</p>
                      <p className="text-[10px] text-slate-400 truncate">
                        {p.config?.searchType || "—"} · {p.config?.maxResults ?? "?"} results
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => handleDelete(p, e)}
                      disabled={deletingId === p.id}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 shrink-0"
                      data-testid={`preset-delete-${p.id}`}
                      title="Delete preset"
                    >
                      {deletingId === p.id
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <Trash2 className="w-3 h-3" />}
                    </button>
                  </DropdownMenuItem>
                );
              })}
            </div>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => { e.preventDefault(); setSaveOpen(true); }}
            className="cursor-pointer text-blue-600 focus:text-blue-700"
            data-testid="preset-save-current-btn"
          >
            <BookmarkPlus className="w-3.5 h-3.5 mr-2" />
            <span className="text-xs font-medium">Save current as preset…</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-md" data-testid="preset-save-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookmarkPlus className="w-5 h-5 text-blue-600" />
              Save as Preset
            </DialogTitle>
            <DialogDescription className="text-sm">
              Save the current search configuration so you can re-run it with one click.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              autoFocus
              placeholder='e.g. "Date Night Reels"'
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !saving) handleSave(); }}
              maxLength={60}
              data-testid="preset-name-input"
            />
            <p className="text-[11px] text-slate-400">
              Captures: search type, inputs, max results, date range, and tagged-posts toggle.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline" onClick={() => setSaveOpen(false)}
              data-testid="preset-cancel-btn"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave} disabled={saving || !name.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white"
              data-testid="preset-save-btn"
            >
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <BookmarkPlus className="w-4 h-4 mr-2" />}
              Save preset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
