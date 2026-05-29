import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Zap, Clock, ExternalLink, CheckCircle2 } from "lucide-react";

/**
 * Explains the Apify connection methods and surfaces which one IS in use
 * for a given query size — so users understand the auto-routing logic.
 */
export function ApifyConnectionGuide() {
  const methods = [
    {
      name: "Fast Sync (run-sync-get-dataset-items)",
      best: "Small queries (≤ 25 results, single hashtag/username)",
      latency: "1 round-trip · 5–30 s typical",
      recommended: true,
      docs: "https://docs.apify.com/api/v2/act-run-sync-get-dataset-items-post",
    },
    {
      name: "Async Run + Poll (/runs)",
      best: "Bulk queries, multiple usernames, > 25 results, long jobs",
      latency: "polled every 2 s · 30 s – several minutes",
      recommended: false,
      docs: "https://docs.apify.com/api/v2/act-runs-post",
    },
    {
      name: "Webhooks (push notifications)",
      best: "Event-driven workflows, fire-and-forget",
      latency: "Not used by this app",
      recommended: false,
      docs: "https://docs.apify.com/platform/integrations/webhooks",
    },
  ];

  return (
    <Card className="border-blue-100 bg-gradient-to-br from-blue-50/30 to-white" data-testid="apify-connection-guide">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          <Zap className="w-4 h-4 text-blue-600" />
          Apify Connection Methods · Auto-routed for best performance
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        <p className="text-xs text-slate-600">
          The app picks the right Apify endpoint automatically based on your search size.
          No configuration needed — but if you want to know what's happening under the hood:
        </p>
        <div className="space-y-2">
          {methods.map((m) => (
            <div
              key={m.name}
              className={`p-3 rounded-lg border ${m.recommended ? "border-green-300 bg-green-50/50" : "border-slate-200 bg-white"}`}
              data-testid={`apify-method-${m.name.split(" ")[0].toLowerCase()}`}
            >
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-slate-800 font-mono">{m.name}</span>
                    {m.recommended && (
                      <Badge className="bg-green-100 text-green-700 border-green-300 text-[10px] h-5">
                        <CheckCircle2 className="w-3 h-3 mr-1" />in use for small queries
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-600 mt-1">
                    <span className="font-medium">Best for:</span> {m.best}
                  </p>
                  <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" /> {m.latency}
                  </p>
                </div>
                <Button
                  variant="ghost" size="sm" asChild
                  className="h-7 px-2 text-[11px] text-blue-600 hover:text-blue-700 shrink-0"
                >
                  <a href={m.docs} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-3 h-3 mr-1" />Docs
                  </a>
                </Button>
              </div>
            </div>
          ))}
        </div>
        <div className="p-2.5 rounded-md bg-blue-50 border border-blue-100">
          <p className="text-[11px] text-blue-800 leading-relaxed">
            <span className="font-semibold">For best performance:</span> Use single hashtag or single username searches with ≤25 results — this triggers the fast-sync path and returns in seconds. Large batches automatically switch to async with progress tracking.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
