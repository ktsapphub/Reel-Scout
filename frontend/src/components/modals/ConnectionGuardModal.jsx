import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertCircle, Settings as SettingsIcon, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

/**
 * Blocking dialog shown when the user clicks Run Search while Apify is known
 * to be in a failed state. Lets them fix it (Settings) or proceed anyway
 * (in case the health record is just stale).
 */
export function ConnectionGuardModal({
  open, onClose, onProceedAnyway, services, isRechecking, onRecheck,
}) {
  const navigate = useNavigate();

  const failed = services.filter(s => s.state === "failed");
  const stale = services.filter(s => s.state === "stale" || s.state === "unknown");

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md" data-testid="connection-guard-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700">
            <AlertCircle className="w-5 h-5" />
            Connection issue detected
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          <p className="text-sm text-slate-600">
            Running a search now will likely fail. Here's what's wrong:
          </p>

          <div className="space-y-2 bg-slate-50 rounded-lg p-3 border border-slate-200">
            {failed.map(s => (
              <div key={s.name} className="flex items-center gap-2 text-sm">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                <span className="font-medium capitalize text-slate-800">{s.name}</span>
                <span className="text-red-700 text-xs">connection failed</span>
              </div>
            ))}
            {stale.map(s => (
              <div key={s.name} className="flex items-center gap-2 text-sm">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="font-medium capitalize text-slate-800">{s.name}</span>
                <span className="text-amber-700 text-xs">verification stale or missing</span>
              </div>
            ))}
          </div>

          <p className="text-xs text-slate-500">
            Most likely cause: an API token expired or was rotated. Open Settings to update or re-verify it.
          </p>
        </div>

        <DialogFooter className="gap-2 flex-col sm:flex-row pt-2">
          <Button
            variant="outline" size="sm" onClick={onRecheck}
            disabled={isRechecking}
            className="border-slate-200"
            data-testid="guard-recheck-btn"
          >
            {isRechecking ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : null}
            Re-check now
          </Button>
          <Button
            variant="ghost" size="sm" onClick={() => { onClose(); onProceedAnyway?.(); }}
            className="text-slate-500"
            data-testid="guard-proceed-anyway-btn"
          >
            Run anyway
          </Button>
          <Button
            size="sm"
            onClick={() => { onClose(); navigate("/settings"); }}
            className="bg-blue-600 hover:bg-blue-700 text-white"
            data-testid="guard-open-settings-btn"
          >
            <SettingsIcon className="w-3 h-3 mr-2" />
            Open Settings to fix
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
