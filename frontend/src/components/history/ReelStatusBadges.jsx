import { CheckCircle2, FileText, Cloud } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/**
 * Renders the small status badges (Cloudinary / Exported) overlaid on a reel
 * thumbnail in the History page.
 */
export function ReelStatusBadges({ reel, compact = false }) {
  const uploaded = !!reel?.cloudinary_url;
  const exported = !!reel?.exported_at;
  if (!uploaded && !exported) return null;

  if (compact) {
    return (
      <div className="absolute top-1 left-1 flex flex-col gap-1 z-10" data-testid="reel-status-badges">
        {uploaded && (
          <span
            className="bg-emerald-500 text-white rounded-full w-5 h-5 flex items-center justify-center shadow"
            title="Uploaded to Cloudinary"
            data-testid="badge-uploaded"
          >
            <Cloud className="w-3 h-3" />
          </span>
        )}
        {exported && (
          <span
            className="bg-sky-500 text-white rounded-full w-5 h-5 flex items-center justify-center shadow"
            title="Previously exported to CSV"
            data-testid="badge-exported"
          >
            <FileText className="w-3 h-3" />
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1" data-testid="reel-status-badges">
      {uploaded && (
        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px] h-5 px-1.5" data-testid="badge-uploaded">
          <CheckCircle2 className="w-3 h-3 mr-1" />Cloudinary
        </Badge>
      )}
      {exported && (
        <Badge className="bg-sky-100 text-sky-700 border-sky-200 text-[10px] h-5 px-1.5" data-testid="badge-exported">
          <FileText className="w-3 h-3 mr-1" />Exported
        </Badge>
      )}
    </div>
  );
}
