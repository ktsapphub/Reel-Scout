import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  CheckCircle2, XCircle, Loader2, RefreshCw, Clock,
  Key, ChevronDown, AlertCircle,
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
  isChecking, onCheck, credentials, onSaveCredential, onResetCredential, children,
}) {
  const [open, setOpen] = useState(false);
  const ago = timeAgo(checkedAt);
  const isStale = checkedAt && validUntil
    ? Date.now() > new Date(validUntil).getTime()
    : false;
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
              variant="ghost" size="sm" onClick={onCheck} disabled={isChecking}
              className="h-7 px-2" data-testid={`check-${slug}`}
            >
              {isChecking ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {children}
        {credentials && credentials.length > 0 && (
          <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger asChild>
              <Button
                variant="outline" size="sm"
                className="w-full justify-between h-8 text-xs border-slate-200 bg-slate-50/50"
                data-testid={`toggle-creds-${slug}`}
              >
                <span className="flex items-center gap-1.5">
                  <Key className="w-3 h-3 text-slate-500" />
                  Manage credentials ({credentials.length})
                </span>
                <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2 space-y-1.5">
              {credentials.map((c) => (
                <CredentialRow
                  key={c.key} cred={c}
                  onSave={onSaveCredential} onReset={onResetCredential}
                />
              ))}
              <p className="text-[10px] text-slate-400 px-1 flex items-start gap-1 mt-1">
                <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                Saving a new value is verified against the live API before being stored (encrypted) in the database. The change takes effect immediately and survives restarts.
              </p>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}
