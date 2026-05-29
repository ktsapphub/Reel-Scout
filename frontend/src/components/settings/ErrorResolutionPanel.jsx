import { AlertCircle, ExternalLink, RefreshCw, KeyRound, Database, Cloud } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Maps connection errors to clear, actionable resolution steps.
 * Each service knows which error patterns commonly occur and surfaces
 * a specific fix (with a link/CTA) rather than a raw error string.
 */
const RULES = {
  apify: [
    {
      match: /401|unauthorized|invalid.*token|token.*invalid/i,
      title: "Apify token is invalid or expired",
      steps: [
        'Open Apify Console → Settings → Integrations',
        "Click Personal API tokens → either rotate the existing token or create a new one",
        "Paste the new token into both 'Apify Hashtag Token' + 'Apify Username Token' inputs below",
        "Optionally set the expiration date you configured in Apify Console",
        "Click Save — the app validates the token live before storing it",
      ],
      cta: { label: "Open Apify Console", url: "https://console.apify.com/settings/integrations" },
    },
    {
      match: /403|forbidden|access.*denied/i,
      title: "Apify account doesn't have access to one of the actors",
      steps: [
        "Check your Apify plan — some actors require paid tier",
        "Visit each actor's page (linked in Build Info below) and confirm 'Run actor' button works",
        "If an actor is private/archived, contact Apify support",
      ],
      cta: { label: "Apify Pricing", url: "https://apify.com/pricing" },
    },
    {
      match: /timeout|timed out|ECONNRESET|network/i,
      title: "Network timeout calling Apify",
      steps: [
        "Apify API may be having transient issues — click Re-verify in 30 seconds",
        "Check Apify status page for incidents",
        "If persistent, reduce max-results below 25 to use the faster sync path",
      ],
      cta: { label: "Apify Status", url: "https://status.apify.com" },
    },
    {
      match: /rate.*limit|429/i,
      title: "Apify rate limit reached",
      steps: [
        "Wait 60 seconds before retrying",
        "Apify free tier limits API calls — upgrade plan or space out searches",
      ],
      cta: { label: "Apify Plans", url: "https://apify.com/pricing" },
    },
    {
      match: /credentials.*not configured|missing_credentials|no token/i,
      title: "Apify token not yet configured",
      steps: [
        "Get a Personal API Token from Apify Console",
        "Paste it into both Apify token inputs below + click Save",
      ],
      cta: { label: "Get Apify Token", url: "https://console.apify.com/settings/integrations" },
    },
  ],
  cloudinary: [
    {
      match: /401|unauthorized|invalid.*signature|invalid.*api_key/i,
      title: "Cloudinary credentials are invalid",
      steps: [
        "Open Cloudinary Console → Settings → API Keys",
        "Copy Cloud Name, API Key, and API Secret",
        "Paste all three into the inputs below, then click Save on each",
        "Click 'Re-verify connection' to confirm",
      ],
      cta: { label: "Open Cloudinary Console", url: "https://console.cloudinary.com/settings/api-keys" },
    },
    {
      match: /credentials.*not configured|missing_credentials/i,
      title: "Cloudinary not yet configured",
      steps: [
        "Sign up or log into Cloudinary (free tier covers basic usage)",
        "From your dashboard, grab Cloud Name + API Key + API Secret",
        "Paste each into the corresponding input below + Save",
      ],
      cta: { label: "Cloudinary Dashboard", url: "https://console.cloudinary.com/" },
    },
    {
      match: /timeout|network|ECONNRESET/i,
      title: "Network timeout to Cloudinary",
      steps: [
        "Cloudinary may have a transient issue — click Re-verify in 30 seconds",
        "Check Cloudinary status page",
      ],
      cta: { label: "Cloudinary Status", url: "https://status.cloudinary.com" },
    },
  ],
  mongodb: [
    {
      match: /connection.*refused|ECONNREFUSED|timed out/i,
      title: "Cannot reach MongoDB",
      steps: [
        "MongoDB is hosted internally — this should never fail in production",
        "Check supervisor backend logs for the actual MongoDB error",
        "Contact the platform admin if it persists",
      ],
    },
    {
      match: /auth/i,
      title: "MongoDB auth failed",
      steps: [
        "MONGO_URL credentials in backend/.env may be wrong",
        "Contact platform admin",
      ],
    },
  ],
};

const SERVICE_ICONS = {
  apify: KeyRound,
  cloudinary: Cloud,
  mongodb: Database,
};

function matchRule(service, errorMessage) {
  const rules = RULES[service] || [];
  return rules.find((r) => r.match.test(errorMessage || ""));
}

export function ErrorResolutionPanel({ service, error, onRetry }) {
  if (!error) return null;
  const rule = matchRule(service, typeof error === "string" ? error : (error.message || ""));
  const Icon = SERVICE_ICONS[service] || AlertCircle;

  if (!rule) {
    return (
      <div
        className="p-3 rounded-lg bg-red-50 border border-red-200 mt-2"
        data-testid={`error-resolution-${service}-generic`}
      >
        <div className="flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-red-800">Connection failed</p>
            <p className="text-xs text-red-700 mt-1 font-mono break-all">{String(error)}</p>
            {onRetry && (
              <Button
                size="sm" variant="outline" onClick={onRetry}
                className="h-7 px-2 text-[11px] border-red-300 text-red-700 hover:bg-red-100 mt-2"
                data-testid={`error-retry-${service}`}
              >
                <RefreshCw className="w-3 h-3 mr-1" />Retry
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="p-3.5 rounded-lg bg-amber-50 border border-amber-300 mt-2 space-y-2.5"
      data-testid={`error-resolution-${service}`}
    >
      <div className="flex items-start gap-2">
        <Icon className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-900">{rule.title}</p>
          <p className="text-[11px] text-amber-700 mt-0.5 font-mono break-all">{String(error)}</p>
        </div>
      </div>
      <div className="pl-6">
        <p className="text-[11px] uppercase tracking-wide text-amber-800 font-semibold mb-1.5">How to resolve</p>
        <ol className="list-decimal list-outside ml-4 space-y-1">
          {rule.steps.map((step, idx) => (
            <li key={idx} className="text-xs text-slate-700 leading-relaxed">{step}</li>
          ))}
        </ol>
      </div>
      <div className="pl-6 flex items-center gap-2 flex-wrap pt-1">
        {rule.cta && (
          <Button
            size="sm" variant="outline" asChild
            className="h-7 px-2.5 text-[11px] border-amber-400 text-amber-800 hover:bg-amber-100"
            data-testid={`error-cta-${service}`}
          >
            <a href={rule.cta.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-3 h-3 mr-1" />{rule.cta.label}
            </a>
          </Button>
        )}
        {onRetry && (
          <Button
            size="sm" onClick={onRetry}
            className="h-7 px-2.5 text-[11px] bg-amber-600 hover:bg-amber-700 text-white"
            data-testid={`error-retry-${service}`}
          >
            <RefreshCw className="w-3 h-3 mr-1" />Re-test connection
          </Button>
        )}
      </div>
    </div>
  );
}
