import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  BookOpen,
  User,
  Hash,
  Search,
  Check,
  Lightbulb,
  Info,
  ArrowRight,
  Cloud,
  FileSpreadsheet,
  CheckCircle2,
  ChevronUp,
  ChevronDown,
  Link as LinkIcon,
} from "lucide-react";

const SEARCH_HELP = {
  username: {
    tooltip: "Search for reels from specific Instagram accounts by entering their usernames directly.",
    title: "Search by Username",
    description: "Get rich details about all reels from one or more Instagram users.",
    whatCanBeExtracted: [
      "Reel metadata (caption, timestamp, hashtags, mentions, tagged users)",
      "Transcript (if available)",
      "Product tags and music info (artist, original audio)",
      "Engagement metrics (likes, comments, shares, views/play counts)",
      "Video download URL and thumbnails",
      "Comment details with timestamps",
      "Sponsored content and co-author info"
    ],
    bestUseCases: [
      "Detailed analytics on specific creators",
      "Competitive analysis for known accounts",
      "Data collection for reporting or AI workflows"
    ],
    tips: [
      "Enter usernames without the @ symbol",
      "Add multiple usernames to compare creators",
      "Underscores are allowed in usernames"
    ]
  },
  url: {
    tooltip: "Paste Instagram profile URLs and we'll extract the usernames to find their reels.",
    title: "Search by Profile URL",
    description: "Paste full Instagram profile URLs - we'll extract usernames automatically.",
    whatCanBeExtracted: [
      "Same as Username search - full reel details",
      "All public reels from the profile",
      "Complete metadata and engagement metrics"
    ],
    bestUseCases: [
      "When you have profile links saved or shared",
      "Copy-paste directly from Instagram",
      "Batch processing multiple profile links"
    ],
    tips: [
      "Supports: instagram.com/username format",
      "One URL per line for multiple profiles",
      "Also accepts plain usernames without full URL"
    ]
  },
  hashtag: {
    tooltip: "Discover reels tagged with specific hashtags - great for trending topics and content discovery.",
    title: "Search by Hashtag",
    description: "Find trending reels and posts associated with specific hashtags.",
    whatCanBeExtracted: [
      "Posts and reels tagged with the hashtag",
      "Caption and timestamp",
      "Media type (post vs reel)",
      "Likes, plays/views, shares, comments count",
      "Video URLs and thumbnails",
      "Audio metadata and related hashtags"
    ],
    bestUseCases: [
      "Trend discovery by topic",
      "Find trending reels under a hashtag",
      "Competitive analysis for hashtag performance",
      "Bulk collection by topic rather than user"
    ],
    tips: [
      "Enter hashtag with or without # symbol",
      "Good for discovering new content creators",
      "Combine with Username search for deeper analysis"
    ]
  }
};

export { SEARCH_HELP };

export function HelpPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("username");

  return (
    <Card className="border-slate-200 shadow-sm mb-6 animate-fade-in">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-slate-50 transition-colors py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-blue-600" />
                <CardTitle className="text-base font-semibold text-slate-900">
                  How to Search & Workflow Guide
                </CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {isOpen ? "Click to collapse" : "Click to expand"}
                </Badge>
                {isOpen ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 pb-4">
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Search Methods</h3>
              <div className="flex gap-2 mb-4">
                {[
                  { key: "username", icon: User, label: "Username" },
                  { key: "url", icon: LinkIcon, label: "Profile URL" },
                  { key: "hashtag", icon: Hash, label: "Hashtag" },
                ].map(({ key, icon: Icon, label }) => (
                  <Button key={key} variant={activeSection === key ? "default" : "outline"} size="sm"
                    onClick={() => setActiveSection(key)} className={activeSection === key ? "bg-blue-600" : ""}>
                    <Icon className="w-4 h-4 mr-1" />{label}
                  </Button>
                ))}
              </div>
              <div className="bg-slate-50 rounded-lg p-4">
                <h4 className="font-semibold text-slate-900 mb-2">{SEARCH_HELP[activeSection].title}</h4>
                <p className="text-sm text-slate-600 mb-4">{SEARCH_HELP[activeSection].description}</p>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">What Can Be Extracted</h5>
                    <ul className="space-y-1">
                      {SEARCH_HELP[activeSection].whatCanBeExtracted.map((item, i) => (
                        <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                          <Check className="w-3 h-3 text-green-600 mt-1 flex-shrink-0" />{item}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Best Use Cases</h5>
                    <ul className="space-y-1 mb-4">
                      {SEARCH_HELP[activeSection].bestUseCases.map((item, i) => (
                        <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                          <Lightbulb className="w-3 h-3 text-amber-500 mt-1 flex-shrink-0" />{item}
                        </li>
                      ))}
                    </ul>
                    <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Tips</h5>
                    <ul className="space-y-1">
                      {SEARCH_HELP[activeSection].tips.map((item, i) => (
                        <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                          <Info className="w-3 h-3 text-blue-500 mt-1 flex-shrink-0" />{item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
            <div className="border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Cloudinary Upload & CSV Export Workflow</h3>
              <div className="bg-gradient-to-r from-blue-50 to-green-50 rounded-lg p-4">
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  {[
                    { icon: Search, label: "1. Search", color: "text-blue-600" },
                    { icon: CheckCircle2, label: "2. Select", color: "text-blue-600" },
                    { icon: Cloud, label: "3. Upload", color: "text-blue-600" },
                    { icon: FileSpreadsheet, label: "4. Export CSV", color: "text-green-600" },
                  ].map((step, i) => (
                    <div key={i} className="contents">
                      {i > 0 && <ArrowRight className="w-4 h-4 text-slate-400" />}
                      <div className="flex items-center gap-2 bg-white rounded-full px-3 py-1.5 shadow-sm">
                        <step.icon className={`w-4 h-4 ${step.color}`} /><span className="text-sm font-medium">{step.label}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="grid md:grid-cols-2 gap-4 text-sm">
                  <div className="bg-white rounded-lg p-3">
                    <h5 className="font-semibold text-slate-900 mb-2 flex items-center gap-2">
                      <Cloud className="w-4 h-4 text-blue-600" />Cloudinary Upload
                    </h5>
                    <ul className="space-y-1 text-slate-600">
                      <li>Videos upload to: <code className="bg-slate-100 px-1 rounded text-xs">"Content for Vibe Check"</code></li>
                      <li>Naming: <code className="bg-slate-100 px-1 rounded text-xs">username_content_MMM-DD-YYYY</code></li>
                      <li>Progress shows each video's status and file size</li>
                      <li>Uploaded videos get green "Uploaded" badge</li>
                    </ul>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <h5 className="font-semibold text-slate-900 mb-2 flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4 text-green-600" />CSV Export
                    </h5>
                    <ul className="space-y-1 text-slate-600">
                      <li>Export button appears after upload completes</li>
                      <li>CSV includes Cloudinary URL for each video</li>
                      <li>All metadata columns included (16 total)</li>
                      <li>Filename: <code className="bg-slate-100 px-1 rounded text-xs">username_MM-DD-YY_results.csv</code></li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
