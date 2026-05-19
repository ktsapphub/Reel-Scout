import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Clock,
  Music,
  Users,
  ExternalLink,
  Check,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

export function ReelCard({ reel, isSelected, onToggleSelect, isExpanded, onToggleTranscript, isUploaded, index }) {
  const videoUrl = reel.downloaded_video_url || reel.original_video_url;
  const truncatedTranscript = reel.video_transcript?.length > 100
    ? reel.video_transcript.slice(0, 100) + "..."
    : reel.video_transcript;

  return (
    <Card className={`border-slate-200 overflow-hidden hover-lift ${isUploaded ? 'ring-2 ring-green-200' : ''}`} data-testid={`reel-row-${index}`}>
      <div className="flex flex-col lg:flex-row">
        <div className="lg:w-72 flex-shrink-0 bg-slate-900 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <Checkbox checked={isSelected} onCheckedChange={onToggleSelect} data-testid={`select-reel-${index}`} />
              <span className="text-white text-sm font-medium">#{index}</span>
            </div>
            {isUploaded && <Badge className="bg-green-500 text-white text-xs"><Check className="w-3 h-3 mr-1" />Uploaded</Badge>}
          </div>
          {videoUrl ? (
            <video src={videoUrl} controls className="w-full aspect-[9/16] max-h-[280px] object-contain rounded-lg" preload="metadata" data-testid={`video-player-${index}`}>
              Your browser does not support the video tag.
            </video>
          ) : (
            <div className="w-full aspect-[9/16] max-h-[280px] bg-slate-800 rounded-lg flex items-center justify-center">
              <p className="text-slate-400 text-sm">No video available</p>
            </div>
          )}
        </div>

        <div className="flex-1 p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-slate-500 uppercase tracking-wide">Owner</Label>
              <p className="font-semibold text-slate-900">@{reel.owner_username}</p>
              {reel.owner_full_name && <p className="text-sm text-slate-600">{reel.owner_full_name}</p>}
            </div>
            <div>
              <Label className="text-xs text-slate-500 uppercase tracking-wide">Duration</Label>
              <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-slate-400" /><span className="text-slate-900">{reel.video_duration_seconds}s</span></div>
            </div>
            <div>
              <Label className="text-xs text-slate-500 uppercase tracking-wide">Posted</Label>
              <p className="text-slate-900">{reel.timestamp || "N/A"}</p>
            </div>
            <div>
              <Label className="text-xs text-slate-500 uppercase tracking-wide">Reel URL</Label>
              <a href={reel.reel_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700 text-sm flex items-center gap-1">
                View on Instagram<ExternalLink className="w-3 h-3" />
              </a>
            </div>
            {(reel.music_artist || reel.music_song) && (
              <div className="md:col-span-2">
                <Label className="text-xs text-slate-500 uppercase tracking-wide">Music</Label>
                <div className="flex items-center gap-2 text-slate-700">
                  <Music className="w-4 h-4 text-slate-400" />
                  <span>{reel.music_song || "Unknown"} - {reel.music_artist || "Unknown"}{reel.music_original_audio && <Badge variant="outline" className="ml-2 text-xs">Original</Badge>}</span>
                </div>
              </div>
            )}
            {reel.tagged_users?.length > 0 && (
              <div className="md:col-span-2">
                <Label className="text-xs text-slate-500 uppercase tracking-wide">Tagged Users</Label>
                <div className="flex items-center gap-2 flex-wrap mt-1">
                  <Users className="w-4 h-4 text-slate-400" />
                  {reel.tagged_users.map((user, i) => <Badge key={i} variant="secondary" className="text-xs">@{user}</Badge>)}
                </div>
              </div>
            )}
            {reel.video_transcript && (
              <div className="md:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-xs text-slate-500 uppercase tracking-wide">Transcript</Label>
                  {reel.video_transcript.length > 100 && (
                    <Button variant="ghost" size="sm" onClick={onToggleTranscript} className="text-blue-600 text-xs h-6 px-2">
                      {isExpanded ? <><ChevronUp className="w-3 h-3 mr-1" /> Collapse</> : <><ChevronDown className="w-3 h-3 mr-1" /> Expand</>}
                    </Button>
                  )}
                </div>
                <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg">{isExpanded ? reel.video_transcript : truncatedTranscript}</p>
              </div>
            )}
            {reel.cloudinary_url && (
              <div className="md:col-span-2">
                <Label className="text-xs text-slate-500 uppercase tracking-wide">Cloudinary</Label>
                <div className="flex items-center gap-2">
                  <Badge className="bg-green-100 text-green-700 hover:bg-green-100"><Check className="w-3 h-3 mr-1" />Uploaded</Badge>
                  <a href={reel.cloudinary_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700 text-sm flex items-center gap-1">
                    View on Cloudinary<ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
