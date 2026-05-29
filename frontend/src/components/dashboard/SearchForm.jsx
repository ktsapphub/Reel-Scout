import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Search, User, Hash, Link as LinkIcon, Play, Plus, X, Square,
  HelpCircle, FileUp, FileDown, DollarSign, CalendarIcon, RotateCcw, Film,
} from "lucide-react";
import { format } from "date-fns";
import { SEARCH_HELP } from "@/components/HelpPanel";
import { SearchProgress } from "./SearchProgress";
import { HandleValidityIndicator } from "./HandleValidityIndicator";
import { validateInstagramHandle, validateInstagramUrl, validateInstagramPostUrl, MAX_POST_URLS } from "@/lib/instagramValidator";

const MAX_RESULTS_OPTIONS = [5, 10, 25, 50, 100, 250];
const MAX_USERNAME_FIELDS = 10;

export function SearchForm({
  // form state
  searchType, setSearchType,
  usernames, setUsernames,
  profileUrls, setProfileUrls,
  postUrls, setPostUrls,
  hashtagInput, setHashtagInput,
  maxResults, setMaxResults,
  includeTaggedPosts, setIncludeTaggedPosts,
  dateRange, setDateRange,
  // helpers
  onSearch, onStop, onRestart, hasResults, onCsvUpload, onDownloadSampleCsv,
  // polling state
  searching, progress, estimatedTime, itemsProcessed,
  // presets
  presetMenu,
}) {
  const estimatedCost = ((maxResults / 1000) * 2.6).toFixed(2);

  const addUsernameField = () => { if (usernames.length < MAX_USERNAME_FIELDS) setUsernames([...usernames, ""]); };
  const removeUsernameField = (i) => { if (usernames.length > 1) setUsernames(usernames.filter((_, x) => x !== i)); };
  const updateUsername = (i, v) => { const n = [...usernames]; n[i] = v; setUsernames(n); };

  const addProfileUrlField = () => { if (profileUrls.length < MAX_USERNAME_FIELDS) setProfileUrls([...profileUrls, ""]); };
  const removeProfileUrlField = (i) => { if (profileUrls.length > 1) setProfileUrls(profileUrls.filter((_, x) => x !== i)); };
  const updateProfileUrl = (i, v) => { const n = [...profileUrls]; n[i] = v; setProfileUrls(n); };

  const addPostUrlField = () => { if (postUrls.length < MAX_POST_URLS) setPostUrls([...postUrls, ""]); };
  const removePostUrlField = (i) => { if (postUrls.length > 1) setPostUrls(postUrls.filter((_, x) => x !== i)); };
  const updatePostUrl = (i, v) => { const n = [...postUrls]; n[i] = v; setPostUrls(n); };

  return (
    <Card className="border-slate-200 shadow-sm mb-8 animate-fade-in">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Search className="w-5 h-5 text-blue-600" />Search Reels
          </CardTitle>
          {presetMenu}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <Tabs value={searchType} onValueChange={setSearchType}>
          <TabsList className="bg-slate-100 p-1">
            {[
              { value: "username", icon: User, label: "Username", help: SEARCH_HELP.username.tooltip },
              { value: "url", icon: LinkIcon, label: "Profile URL", help: SEARCH_HELP.url.tooltip },
              { value: "post_url", icon: Film, label: "Post URL", help: `Look up specific reel or post URLs (up to ${MAX_POST_URLS}). Fast & exact — perfect for finding details on links you already have.` },
              { value: "hashtag", icon: Hash, label: "Hashtag", help: SEARCH_HELP.hashtag.tooltip },
            ].map(tab => (
              <Tooltip key={tab.value}><TooltipTrigger asChild>
                <TabsTrigger value={tab.value} className="data-[state=active]:bg-white data-[state=active]:text-blue-600" data-testid={`tab-${tab.value}`}>
                  <tab.icon className="w-4 h-4 mr-2" />{tab.label}<HelpCircle className="w-3 h-3 ml-1 text-slate-400" />
                </TabsTrigger>
              </TooltipTrigger><TooltipContent><p className="max-w-xs">{tab.help}</p></TooltipContent></Tooltip>
            ))}
          </TabsList>

          <TabsContent value="username" className="mt-4 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-slate-700 font-medium">Instagram Username(s)</Label>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400">{usernames.length}/{MAX_USERNAME_FIELDS} fields</span>
                  <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
                    <Tooltip><TooltipTrigger asChild>
                      <button type="button" onClick={onDownloadSampleCsv} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 font-medium" data-testid="download-sample-csv">
                        <FileDown className="w-3 h-3" />Sample
                      </button>
                    </TooltipTrigger><TooltipContent><p>Download a sample CSV template</p></TooltipContent></Tooltip>
                    <Tooltip><TooltipTrigger asChild>
                      <label className="cursor-pointer">
                        <input type="file" accept=".csv,.txt" onChange={onCsvUpload} className="hidden" data-testid="csv-upload-input" />
                        <span className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"><FileUp className="w-3 h-3" />Import CSV</span>
                      </label>
                    </TooltipTrigger><TooltipContent><p>Upload CSV with usernames</p></TooltipContent></Tooltip>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                {usernames.map((username, index) => {
                  const v = validateInstagramHandle(username);
                  return (
                    <div key={index} className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">@</span>
                        <Input
                          placeholder="user_name"
                          value={username}
                          onChange={(e) => updateUsername(index, e.target.value)}
                          className={`h-10 pl-8 pr-9 border-slate-200 focus:border-blue-500 ${
                            v.state === "invalid" ? "border-red-300 focus:border-red-500" :
                            v.state === "valid" ? "border-emerald-300 focus:border-emerald-500" : ""
                          }`}
                          data-testid={`username-input-${index}`}
                        />
                        <HandleValidityIndicator result={v} testId={`username-validity-${index}`} />
                      </div>
                      {usernames.length > 1 && (
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeUsernameField(index)} className="h-10 w-10 text-slate-400 hover:text-red-500" data-testid={`remove-username-${index}`}>
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 mt-2">
                {usernames.length < MAX_USERNAME_FIELDS && (
                  <Button type="button" variant="outline" size="sm" onClick={addUsernameField} className="border-dashed border-slate-300 text-slate-600 hover:border-blue-400 hover:text-blue-600" data-testid="add-username-btn">
                    <Plus className="w-4 h-4 mr-1" />Add Username
                  </Button>
                )}
                {usernames.length > 1 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setUsernames([""])} className="text-slate-500 hover:text-red-600"><X className="w-3 h-3 mr-1" />Clear All</Button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100">
              <div>
                <Label className="text-slate-700 font-medium text-sm mb-2 block">Include Tagged Posts</Label>
                <div className="flex items-center gap-2 mt-2">
                  <Checkbox checked={includeTaggedPosts} onCheckedChange={setIncludeTaggedPosts} data-testid="include-tagged-checkbox" />
                  <span className="text-sm text-slate-600">Include posts where user is tagged</span>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="url" className="mt-4 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-slate-700 font-medium">Instagram Profile(s)</Label>
                <span className="text-xs text-slate-400">{profileUrls.length}/{MAX_USERNAME_FIELDS} fields</span>
              </div>
              <p className="text-sm text-slate-500 mb-3">Enter a full URL or just the username — both work</p>
              <div className="space-y-2">
                {profileUrls.map((url, index) => {
                  const v = validateInstagramUrl(url);
                  return (
                    <div key={index} className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input
                          placeholder="natgeo  or  https://instagram.com/natgeo"
                          value={url}
                          onChange={(e) => updateProfileUrl(index, e.target.value)}
                          className={`h-10 pl-10 pr-9 border-slate-200 focus:border-blue-500 text-sm ${
                            v.state === "invalid" ? "border-red-300 focus:border-red-500" :
                            v.state === "valid" ? "border-emerald-300 focus:border-emerald-500" : ""
                          }`}
                          data-testid={`url-input-${index}`}
                        />
                        <HandleValidityIndicator result={v} testId={`url-validity-${index}`} />
                      </div>
                      {profileUrls.length > 1 && (
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeProfileUrlField(index)} className="h-10 w-10 text-slate-400 hover:text-red-500" data-testid={`remove-url-${index}`}>
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 mt-2">
                {profileUrls.length < MAX_USERNAME_FIELDS && (
                  <Button type="button" variant="outline" size="sm" onClick={addProfileUrlField} className="border-dashed border-slate-300 text-slate-600 hover:border-blue-400 hover:text-blue-600" data-testid="add-url-btn">
                    <Plus className="w-4 h-4 mr-1" />Add Profile
                  </Button>
                )}
                {profileUrls.length > 1 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setProfileUrls([""])} className="text-slate-500 hover:text-red-600"><X className="w-3 h-3 mr-1" />Clear All</Button>
                )}
              </div>
              <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                <p className="text-xs font-semibold text-blue-700 mb-1">Performance Sweet Spot</p>
                <p className="text-xs text-blue-600">Up to <strong>5 accounts</strong> with <strong>25 results each</strong> returns fast, reliable data. Going above 10 accounts or 100+ results per account increases run time and cost significantly.</p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="post_url" className="mt-4 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-slate-700 font-medium">Reel / Post URLs</Label>
                <span className="text-xs text-slate-400">{postUrls.length}/{MAX_POST_URLS} URLs</span>
              </div>
              <p className="text-sm text-slate-500 mb-3">
                Paste up to {MAX_POST_URLS} direct reel or post URLs. Each one is fetched individually (no profile scrape) — the fastest, cheapest way to grab specific content.
              </p>
              <div className="space-y-2">
                {postUrls.map((url, index) => {
                  const v = validateInstagramPostUrl(url);
                  return (
                    <div key={index} className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Film className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input
                          placeholder="https://www.instagram.com/reel/CxYzABC123/"
                          value={url}
                          onChange={(e) => updatePostUrl(index, e.target.value)}
                          className={`h-10 pl-10 pr-9 border-slate-200 focus:border-blue-500 text-sm font-mono ${
                            v.state === "invalid" ? "border-red-300 focus:border-red-500" :
                            v.state === "valid" ? "border-emerald-300 focus:border-emerald-500" : ""
                          }`}
                          data-testid={`post-url-input-${index}`}
                        />
                        <HandleValidityIndicator result={v} testId={`post-url-validity-${index}`} />
                      </div>
                      {postUrls.length > 1 && (
                        <Button type="button" variant="ghost" size="icon" onClick={() => removePostUrlField(index)} className="h-10 w-10 text-slate-400 hover:text-red-500" data-testid={`remove-post-url-${index}`}>
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 mt-2">
                {postUrls.length < MAX_POST_URLS && (
                  <Button type="button" variant="outline" size="sm" onClick={addPostUrlField} className="border-dashed border-slate-300 text-slate-600 hover:border-blue-400 hover:text-blue-600" data-testid="add-post-url-btn">
                    <Plus className="w-4 h-4 mr-1" />Add URL
                  </Button>
                )}
                {postUrls.length > 1 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setPostUrls([""])} className="text-slate-500 hover:text-red-600"><X className="w-3 h-3 mr-1" />Clear All</Button>
                )}
              </div>
              <div className="mt-4 p-3 bg-emerald-50 border border-emerald-100 rounded-lg">
                <p className="text-xs font-semibold text-emerald-700 mb-1">Direct lookup — best for known content</p>
                <p className="text-xs text-emerald-600">Each URL = 1 Apify dataset item. {MAX_POST_URLS} URLs returns in ~5–15 seconds via the fast-sync path. No date filtering needed (you already chose the exact post).</p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="hashtag" className="mt-4 space-y-4">
            <div>
              <Label className="text-slate-700 font-medium">Hashtag</Label>
              <p className="text-sm text-slate-500 mb-2">Enter hashtag with or without # - returns reels only</p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">#</span>
                <Input placeholder="datenight" value={hashtagInput} onChange={(e) => setHashtagInput(e.target.value)} className="h-10 pl-8 border-slate-200 focus:border-blue-500" data-testid="hashtag-input" />
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Date Range Filter — not applicable for Profile URL or direct Post URL lookups */}
        {searchType !== "url" && searchType !== "post_url" && (
          <div className="flex flex-wrap items-end gap-4 pt-4 border-t border-slate-100">
            <div>
              <Label className="text-slate-700 font-medium text-sm mb-2 block">
                Date Range <span className="text-slate-400 font-normal">· filters by post date</span>
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-10 justify-start text-left font-normal border-slate-200 min-w-[260px]" data-testid="date-range-trigger">
                    <CalendarIcon className="w-4 h-4 mr-2 text-slate-400" />
                    {dateRange.from ? (
                      dateRange.to ? (
                        <span className="text-slate-900">{format(dateRange.from, "MMM d, yyyy")} - {format(dateRange.to, "MMM d, yyyy")}</span>
                      ) : (
                        <span className="text-slate-900">From {format(dateRange.from, "MMM d, yyyy")}</span>
                      )
                    ) : (
                      <span className="text-slate-400">Pick a date range (optional)</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="range" selected={dateRange} onSelect={setDateRange} numberOfMonths={2} disabled={{ after: new Date() }} data-testid="date-range-calendar" />
                  <div className="flex items-center justify-between p-3 border-t border-slate-200">
                    <p className="text-xs text-slate-500">Filters reels by post date</p>
                    {(dateRange.from || dateRange.to) && (
                      <Button variant="ghost" size="sm" onClick={() => setDateRange({ from: undefined, to: undefined })} className="text-xs text-slate-500 hover:text-red-600 h-7" data-testid="clear-date-range-btn">
                        <X className="w-3 h-3 mr-1" />Clear
                      </Button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-wrap items-end gap-4 pt-4 border-t border-slate-100">
          <div className="min-w-[200px]">
            <Label className="text-slate-700 font-medium">Max Results</Label>
            <div className="flex items-center gap-2 mt-2">
              <Select
                value={MAX_RESULTS_OPTIONS.includes(maxResults) ? maxResults.toString() : "custom"}
                onValueChange={(v) => v === "custom" ? (!MAX_RESULTS_OPTIONS.includes(maxResults) || setMaxResults(15)) : setMaxResults(parseInt(v))}
              >
                <SelectTrigger className="h-10 border-slate-200 w-[120px]" data-testid="max-results-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MAX_RESULTS_OPTIONS.map(opt => <SelectItem key={opt} value={opt.toString()}>{opt}</SelectItem>)}
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
              {!MAX_RESULTS_OPTIONS.includes(maxResults) && (
                <Input type="number" min="1" max="1000" value={maxResults}
                  onChange={(e) => setMaxResults(Math.max(1, Math.min(1000, parseInt(e.target.value) || 5)))}
                  className="h-10 w-20 border-slate-200" data-testid="custom-max-results" />
              )}
              <span className="text-xs text-slate-400">results</span>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
            <DollarSign className="w-4 h-4 text-amber-600" />
            <div><p className="text-xs text-amber-700 font-medium">Est. Cost</p><p className="text-base font-bold text-amber-900">${estimatedCost}</p></div>
          </div>
          <div className="flex items-center gap-2">
            {!searching ? (
              <>
                {(hasResults || usernames.some((u) => u) || profileUrls.some((u) => u) || postUrls.some((u) => u) || hashtagInput) && (
                  <Button
                    onClick={onRestart}
                    variant="outline"
                    className="h-10 px-4 border-slate-300 text-slate-700 hover:bg-slate-100 hover:text-slate-900 font-medium rounded-full"
                    data-testid="restart-search-btn"
                    title="Clear results and reset form for a new search"
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />Restart
                  </Button>
                )}
                <Button onClick={onSearch} className="h-10 px-6 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-full" data-testid="run-search-btn">
                  <Play className="w-4 h-4 mr-2" />Run Search
                </Button>
              </>
            ) : (
              <Button onClick={onStop} variant="destructive" className="h-10 px-6 font-medium rounded-full" data-testid="stop-search-btn">
                <Square className="w-4 h-4 mr-2" />Stop Search
              </Button>
            )}
          </div>
        </div>

        {searching && (
          <SearchProgress
            searching={searching}
            progress={progress}
            estimatedTime={estimatedTime}
            itemsProcessed={itemsProcessed}
            maxResults={maxResults}
          />
        )}
      </CardContent>
    </Card>
  );
}
