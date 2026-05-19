import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Wifi,
  WifiOff,
  CheckCircle2,
  XCircle,
  User,
  Hash,
  HelpCircle,
  ExternalLink,
  Loader2,
} from "lucide-react";

const TROUBLESHOOTING_STEPS = {
  hashtag_token: [
    "1. Go to Apify Console -> Settings -> Integrations",
    "2. Find or create a new API token",
    "3. Copy the token and update APIFY_TOKEN in backend/.env",
    "4. Restart the backend service",
    "5. Click 'Recheck' to verify"
  ],
  username_token: [
    "1. Go to Apify Console -> Settings -> Integrations",
    "2. Find or create a new API token",
    "3. Copy the token and update APIFY_USERNAME_TOKEN in backend/.env",
    "4. Restart the backend service",
    "5. Click 'Recheck' to verify"
  ],
  username_actor: [
    "1. Go to apify.com/apify/instagram-profile-scraper",
    "2. Ensure you have access to the actor (click 'Try for free' if needed)",
    "3. Check your Apify subscription allows this actor",
    "4. Verify the actor ID 'xMc5Ga1oCONPmWJIa' in Apify console",
    "5. Check if the actor is currently under maintenance"
  ],
  reel_scraper: [
    "1. Go to apify.com/apify/instagram-reel-scraper",
    "2. Ensure you have access to the actor (click 'Try for free' if needed)",
    "3. Check your Apify subscription allows this actor",
    "4. This actor requires usernames, not hashtags",
    "5. Check Apify status page for any outages"
  ],
  hashtag_actor: [
    "1. Go to apify.com/apify/instagram-hashtag-scraper",
    "2. Ensure you have access to the actor (click 'Try for free' if needed)",
    "3. Verify actor ID 'reGe1ST3OBgYZSsZJ' in your Apify console",
    "4. Check your Apify credits/subscription status",
    "5. Try running the actor manually in Apify to test"
  ]
};

function StatusIndicator({ isValid, label, sublabel, sublabel2, issueKey, expandedHelp, setExpandedHelp }) {
  return (
    <div className="p-3">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-medium text-slate-700">{label}</span>
          {sublabel && <p className="text-xs text-slate-400">{sublabel}</p>}
          {sublabel2 && <p className="text-xs text-slate-300 font-mono">{sublabel2}</p>}
        </div>
        <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${isValid ? 'bg-green-100' : 'bg-red-100'}`}>
          <div className={`w-2 h-2 rounded-full ${isValid ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className={`text-xs font-medium ${isValid ? 'text-green-700' : 'text-red-700'}`}>
            {isValid ? (issueKey?.includes('actor') || issueKey?.includes('scraper') ? 'Active' : 'Connected') : (issueKey?.includes('actor') || issueKey?.includes('scraper') ? 'Inactive' : 'Failed')}
          </span>
        </div>
      </div>
      {!isValid && issueKey && (
        <div className="mt-2">
          <button
            onClick={() => setExpandedHelp(expandedHelp === issueKey ? null : issueKey)}
            className="text-xs text-red-600 hover:text-red-800 flex items-center gap-1"
            data-testid={`troubleshoot-${issueKey}`}
          >
            <HelpCircle className="w-3 h-3" />
            {expandedHelp === issueKey ? 'Hide troubleshooting' : 'How to fix'}
          </button>
          {expandedHelp === issueKey && (
            <div className="mt-2 p-2 bg-red-50 rounded text-xs text-red-700 space-y-1">
              {(TROUBLESHOOTING_STEPS[issueKey] || []).map((step, i) => (
                <p key={i}>{step}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ApifyStatusModal({ isOpen, onClose, status, onRecheck, isChecking }) {
  const [expandedHelp, setExpandedHelp] = useState(null);

  if (!status) return null;

  const canSearchHashtags = status.hashtag_token_valid && status.hashtag_actor_accessible;
  const canSearchUsernames = status.username_token_valid && status.username_actor_accessible;
  const anySearchAvailable = canSearchHashtags || canSearchUsernames;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" data-testid="apify-status-title">
            {anySearchAvailable ? <Wifi className="w-5 h-5 text-green-600" /> : <WifiOff className="w-5 h-5 text-red-600" />}
            Apify Connection Status
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Overall Status Banner */}
          <div className={`p-4 rounded-lg ${anySearchAvailable ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            <div className="flex items-center gap-2">
              {anySearchAvailable ? <CheckCircle2 className="w-5 h-5 text-green-600" /> : <XCircle className="w-5 h-5 text-red-600" />}
              <span className={`font-medium ${anySearchAvailable ? 'text-green-800' : 'text-red-800'}`} data-testid="apify-overall-status">
                {anySearchAvailable
                  ? (canSearchHashtags && canSearchUsernames
                      ? "All search types available"
                      : canSearchHashtags
                        ? "Hashtag search available (username search unavailable)"
                        : "Username search available (hashtag search unavailable)")
                  : "No search types available - see troubleshooting below"}
              </span>
            </div>
          </div>

          {/* Search Capability Summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className={`p-3 rounded-lg border-2 ${canSearchHashtags ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}>
              <div className="flex items-center gap-2 mb-1">
                <Hash className={`w-4 h-4 ${canSearchHashtags ? 'text-green-600' : 'text-red-600'}`} />
                <span className={`font-medium text-sm ${canSearchHashtags ? 'text-green-800' : 'text-red-800'}`}>Hashtag Search</span>
              </div>
              <p className={`text-xs ${canSearchHashtags ? 'text-green-600' : 'text-red-600'}`}>
                {canSearchHashtags ? 'Ready to use' : 'Not available'}
              </p>
            </div>
            <div className={`p-3 rounded-lg border-2 ${canSearchUsernames ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}>
              <div className="flex items-center gap-2 mb-1">
                <User className={`w-4 h-4 ${canSearchUsernames ? 'text-green-600' : 'text-red-600'}`} />
                <span className={`font-medium text-sm ${canSearchUsernames ? 'text-green-800' : 'text-red-800'}`}>Username Search</span>
              </div>
              <p className={`text-xs ${canSearchUsernames ? 'text-green-600' : 'text-red-600'}`}>
                {canSearchUsernames ? 'Ready to use' : 'Not available'}
              </p>
            </div>
          </div>

          {/* API Tokens */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="bg-slate-100 px-3 py-2 border-b border-slate-200">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">API Tokens</p>
            </div>
            <div className="divide-y divide-slate-100">
              <StatusIndicator isValid={status.hashtag_token_valid} label="Hashtag Search Token" sublabel="APIFY_TOKEN in .env"
                issueKey="hashtag_token" expandedHelp={expandedHelp} setExpandedHelp={setExpandedHelp} />
              <StatusIndicator isValid={status.username_token_valid} label="Username Search Token" sublabel="APIFY_USERNAME_TOKEN in .env"
                issueKey="username_token" expandedHelp={expandedHelp} setExpandedHelp={setExpandedHelp} />
            </div>
          </div>

          {/* Apify Actors */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="bg-slate-100 px-3 py-2 border-b border-slate-200">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Apify Actors</p>
            </div>
            <div className="divide-y divide-slate-100">
              <StatusIndicator isValid={status.username_actor_accessible} label="Instagram Profile Scraper"
                sublabel="apify/instagram-profile-scraper" sublabel2="ID: xMc5Ga1oCONPmWJIa"
                issueKey="username_actor" expandedHelp={expandedHelp} setExpandedHelp={setExpandedHelp} />
              <StatusIndicator isValid={status.reel_scraper_accessible} label="Instagram Reel Scraper"
                sublabel="apify/instagram-reel-scraper (Official)" sublabel2="ID: apify~instagram-reel-scraper"
                issueKey="reel_scraper" expandedHelp={expandedHelp} setExpandedHelp={setExpandedHelp} />
              <StatusIndicator isValid={status.hashtag_actor_accessible} label="Instagram Hashtag Scraper"
                sublabel="apify/instagram-hashtag-scraper" sublabel2="ID: reGe1ST3OBgYZSsZJ"
                issueKey="hashtag_actor" expandedHelp={expandedHelp} setExpandedHelp={setExpandedHelp} />
            </div>
          </div>

          {/* Account Info */}
          {status.account_info && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <Label className="text-xs text-blue-700 uppercase tracking-wide">Account Info</Label>
              <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                <div><span className="text-blue-600">Username:</span> <span className="ml-1 text-blue-800 font-medium">{status.account_info.username}</span></div>
                <div><span className="text-blue-600">Plan:</span> <span className="ml-1 text-blue-800 font-medium">{status.account_info.plan || "N/A"}</span></div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-between items-center pt-4 border-t border-slate-200">
          <a href="https://console.apify.com" target="_blank" rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1">
            <ExternalLink className="w-4 h-4" />Open Apify Console
          </a>
          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose} className="border-slate-200" data-testid="apify-modal-close">Close</Button>
            <Button onClick={onRecheck} disabled={isChecking} className="bg-blue-600 hover:bg-blue-700" data-testid="apify-modal-recheck">
              {isChecking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wifi className="w-4 h-4 mr-2" />}
              Recheck
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
