import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Key, Pencil, Save, X, Eye, EyeOff, Loader2,
} from "lucide-react";
import { toast } from "sonner";

const timeAgo = (iso) => {
  if (!iso) return null;
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

export function CredentialRow({ cred, onSave, onReset }) {
  const [editing, setEditing] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [newValue, setNewValue] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!newValue.trim()) { toast.error("Value cannot be empty"); return; }
    setSaving(true);
    try {
      await onSave(cred.key, newValue.trim());
      setEditing(false);
      setNewValue("");
      setRevealed(false);
    } catch {
      /* parent handles toast */
    } finally { setSaving(false); }
  };

  const cancelEdit = () => { setEditing(false); setNewValue(""); setRevealed(false); };

  return (
    <div
      className="flex items-center justify-between gap-3 py-2 px-3 rounded-md bg-white border border-slate-100 hover:border-slate-200 transition-colors"
      data-testid={`cred-row-${cred.key}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Key className="w-3 h-3 text-slate-400" />
          <span className="text-xs font-medium text-slate-700">{cred.label}</span>
          <Badge variant="outline" className="text-[10px] h-4 px-1 border-slate-200 text-slate-500">
            {cred.source === "database" ? "override" : cred.source}
          </Badge>
        </div>
        {editing ? (
          <div className="flex items-center gap-2 mt-1.5">
            <Input
              type={revealed ? "text" : "password"}
              autoFocus
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder={`Enter new ${cred.label.toLowerCase()}`}
              className="h-7 text-xs font-mono"
              data-testid={`cred-input-${cred.key}`}
            />
            <Button
              variant="ghost" size="sm" onClick={() => setRevealed((v) => !v)}
              className="h-7 w-7 p-0" data-testid={`cred-toggle-reveal-${cred.key}`}
            >
              {revealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-slate-500 font-mono mt-0.5" data-testid={`cred-masked-${cred.key}`}>
            {cred.has_value ? cred.masked_value : <span className="italic text-slate-400">not set</span>}
          </p>
        )}
        {cred.updated_at && !editing && (
          <p className="text-[10px] text-slate-400 mt-0.5">
            Updated by {cred.updated_by} · {timeAgo(cred.updated_at)}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {editing ? (
          <>
            <Button
              size="sm" className="bg-blue-600 hover:bg-blue-700 text-white h-7 px-2"
              onClick={handleSave} disabled={saving} data-testid={`cred-save-${cred.key}`}
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            </Button>
            <Button
              variant="ghost" size="sm" onClick={cancelEdit}
              className="h-7 w-7 p-0" data-testid={`cred-cancel-${cred.key}`}
            >
              <X className="w-3 h-3" />
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="ghost" size="sm" onClick={() => setEditing(true)}
              className="h-7 px-2 text-xs" data-testid={`cred-edit-${cred.key}`}
            >
              <Pencil className="w-3 h-3 mr-1" />Edit
            </Button>
            {cred.source === "database" && (
              <Button
                variant="ghost" size="sm" onClick={() => onReset(cred.key)}
                className="h-7 px-2 text-xs text-slate-500 hover:text-red-600"
                data-testid={`cred-reset-${cred.key}`}
                title="Remove DB override, fall back to .env"
              >
                Reset
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
