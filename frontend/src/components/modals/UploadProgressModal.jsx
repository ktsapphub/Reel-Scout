import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Cloud,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  HardDrive,
  ExternalLink,
} from "lucide-react";

export function UploadProgressModal({ isOpen, onClose, uploadStatus }) {
  if (!uploadStatus) return null;

  const { total, completed, failed, items, isUploading } = uploadStatus;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
  const allDone = !isUploading && (completed + failed) === total;
  const totalSize = items
    .filter(i => i.status === "completed")
    .reduce((sum, i) => sum + (i.file_size_bytes || 0), 0);

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader className="pb-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <Cloud className={`w-6 h-6 ${allDone ? (failed > 0 ? "text-amber-600" : "text-green-600") : "text-blue-600"}`} />
            <DialogTitle className="text-lg font-semibold" data-testid="upload-modal-title">
              {isUploading ? "Uploading to Cloudinary..." : (allDone ? "Upload Complete" : "Upload Status")}
            </DialogTitle>
          </div>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">
                {isUploading ? `Uploading ${completed + 1} of ${total}...` : `${completed} of ${total} completed`}
              </span>
              <span className="font-medium text-slate-900">{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
          {allDone && (
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-green-50 rounded-lg text-center">
                <CheckCircle2 className="w-5 h-5 text-green-600 mx-auto mb-1" />
                <p className="text-lg font-bold text-green-700">{completed}</p>
                <p className="text-xs text-green-600">Uploaded</p>
              </div>
              {failed > 0 && (
                <div className="p-3 bg-red-50 rounded-lg text-center">
                  <XCircle className="w-5 h-5 text-red-600 mx-auto mb-1" />
                  <p className="text-lg font-bold text-red-700">{failed}</p>
                  <p className="text-xs text-red-600">Failed</p>
                </div>
              )}
              <div className="p-3 bg-blue-50 rounded-lg text-center">
                <HardDrive className="w-5 h-5 text-blue-600 mx-auto mb-1" />
                <p className="text-lg font-bold text-blue-700">{formatSize(totalSize)}</p>
                <p className="text-xs text-blue-600">Total Size</p>
              </div>
            </div>
          )}
          <ScrollArea className="h-[200px] border border-slate-200 rounded-lg">
            <div className="p-3 space-y-2">
              {items.map((item, idx) => (
                <div
                  key={item.reel_id || idx}
                  className={`flex items-center justify-between p-2 rounded-lg ${
                    item.status === "completed" ? "bg-green-50" :
                    item.status === "failed" ? "bg-red-50" :
                    item.status === "uploading" ? "bg-blue-50" : "bg-slate-50"
                  }`}
                  data-testid={`upload-item-${idx}`}
                >
                  <div className="flex items-center gap-2">
                    {item.status === "completed" && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                    {item.status === "failed" && <XCircle className="w-4 h-4 text-red-600" />}
                    {item.status === "uploading" && <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />}
                    {item.status === "pending" && <Clock className="w-4 h-4 text-slate-400" />}
                    <span className="text-sm font-medium text-slate-700">Video #{idx + 1}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.status === "completed" && item.file_size_display && (
                      <Badge variant="outline" className="text-xs bg-white">{item.file_size_display}</Badge>
                    )}
                    {item.status === "failed" && (
                      <span className="text-xs text-red-600 max-w-[150px] truncate">{item.error || "Upload failed"}</span>
                    )}
                    {item.status === "completed" && item.cloudinary_url && (
                      <a href={item.cloudinary_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700">
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <Button variant="outline" onClick={onClose} disabled={isUploading} className="border-slate-200" data-testid="upload-modal-close">
            {isUploading ? "Uploading..." : "Close"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
