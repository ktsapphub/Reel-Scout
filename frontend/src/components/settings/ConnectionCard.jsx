import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CheckCircle2, XCircle, Loader2, RefreshCw, Clock,
  Key, AlertCircle,
} from "lucide-react";
import { ValidityPill } from "./ValidityPill";
import { CredentialRow } from "./CredentialRow";

const timeAgo = (iso) => {
  if (!iso) return null;
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

export function ConnectionCard({
  title, icon: Icon, status, checkedAt, validUntil, validityMinutes,
  isChecking, onCheck, credentials, onSaveCredential, onResetCredential,
  onRevealCredential, children,
}) {
  const ago = timeAgo(checkedAt);
  const isStale = checkedAt && validUntil ? Date.now() > new Date(validUntil).getTime() : false;
  const slug = title.toLowerCase().replace(/\s/g, "-");

  return (
    <Card
      className={`border-2 transition-colors ${status === true ? "border-green-200" : status === false ? "border-red-200" : "border-slate-200"}`}
      data-testid={`connection-${slug}`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${status === true ? "bg-green-100" : status === false ? "bg-red-100" : "bg-slate-100"}`}>
              <Icon className={`w-4 h-4 ${status === true ? "text-green-600" : status === false ? "text-red-600" : "text-slate-500"}`} />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">{title}</CardTitle>
              {checkedAt && (
                <div className="flex items-center gap-1 mt-0.5">
                  <Clock className={`w-3 h-3 ${isStale ? "text-amber-500" : "text-green-500"}`} />
                  <span className={`text-xs ${isStale ? "text-amber-600" : "text-green-600"}`}>
                    Verified {ago}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <ValidityPill validUntil={validUntil} validityMinutes={validityMinutes} connected={status} />
            {status === true && <Badge className="bg-green-100 text-green-700 text-xs"><CheckCircle2 className="w-3 h-3 mr-1" />Connected</Badge>}
            {status === false && <Badge className="bg-red-100 text-red-700 text-xs"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>}
            {status === null && <Badge variant="outline" className="text-slate-500 text-xs">Not checked</Badge>}
            <Button
              size="sm" onClick={onCheck} disabled={isChecking}
              className="h-7 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs"
              data-testid={`check-${slug}`}
            >
              {isChecking ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
              {status === true ? "Re-verify" : "Verify connection"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {children}
        {credentials && credentials.length > 0 && (
          <div className="pt-3 border-t border-slate-100 space-y-2" data-testid={`creds-section-${slug}`}>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                <Key className="w-3 h-3 text-slate-500" />
                API Credentials ({credentials.length})
              </h3>
              <span className="text-[10px] text-slate-400">click <Eye /> to reveal · click Edit to change</span>
            </div>
            <div className="space-y-2">
              {credentials.map((c) => (
                <CredentialRow
                  key={c.key} cred={c}
                  onSave={onSaveCredential}
                  onReset={onResetCredential}
                  onReveal={onRevealCredential}
                />
              ))}
            </div>
            <p className="text-[10px] text-slate-400 flex items-start gap-1 mt-1">
              <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
              Saving a new value is verified against the live API before being stored (encrypted) in the database. Takes effect immediately, survives restarts. Reveal is audit-logged.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Tiny inline Eye placeholder used in the hint text
function Eye() {
  return (
    <svg className="inline w-3 h-3 -mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
      <circle cx="12" cy="12" r="3"></circle>
    </svg>
  );
}
