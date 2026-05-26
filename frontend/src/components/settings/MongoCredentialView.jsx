import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Key, ChevronDown, Eye, EyeOff, AlertCircle,
} from "lucide-react";

export function MongoCredentialView({ mongoUrl, dbName }) {
  const [revealed, setRevealed] = useState(false);
  const mask = (url) => {
    if (!url) return "not set";
    return url.replace(/(:\/\/[^:]+:)([^@]+)(@)/, "$1••••••••$3");
  };
  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button
          variant="outline" size="sm"
          className="w-full justify-between h-8 text-xs border-slate-200 bg-slate-50/50"
          data-testid="toggle-creds-mongodb"
        >
          <span className="flex items-center gap-1.5">
            <Key className="w-3 h-3 text-slate-500" />
            View connection (read-only)
          </span>
          <ChevronDown className="w-3 h-3" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2 space-y-1.5">
        <div className="flex items-center justify-between gap-2 py-2 px-3 rounded-md bg-white border border-slate-100">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Key className="w-3 h-3 text-slate-400" />
              <span className="text-xs font-medium text-slate-700">MONGO_URL</span>
              <Badge variant="outline" className="text-[10px] h-4 px-1 border-slate-200 text-slate-500">env</Badge>
            </div>
            <p className="text-xs text-slate-500 font-mono mt-0.5 truncate" data-testid="mongo-url-display">
              {revealed ? (mongoUrl || "not set") : mask(mongoUrl)}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              DB: <span className="font-mono">{dbName || "—"}</span>
            </p>
          </div>
          <Button
            variant="ghost" size="sm" onClick={() => setRevealed((v) => !v)}
            className="h-7 w-7 p-0" data-testid="toggle-mongo-reveal"
          >
            {revealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          </Button>
        </div>
        <p className="text-[10px] text-slate-400 px-1 flex items-start gap-1 mt-1">
          <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
          MongoDB connection is managed via .env and cannot be changed at runtime to avoid disconnecting the running app.
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}
