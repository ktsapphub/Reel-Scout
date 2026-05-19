import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  AlertCircle,
  Info,
  Code,
  Lightbulb,
  Maximize2,
  Minimize2,
  Copy,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

export function ExecutionStatusModal({ isOpen, onClose, executionStatus }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  if (!executionStatus) return null;

  const { status, message, error, results_count, run_id } = executionStatus;
  const isSuccess = status === "SUCCEEDED";
  const isError = status === "ERROR" || status === "FAILED" || status === "TIMED-OUT";
  const isAborted = status === "ABORTED";

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={`${isExpanded ? "max-w-4xl h-[80vh]" : "max-w-lg"} transition-all duration-300`}>
        <DialogHeader className="pb-4 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isSuccess && <CheckCircle2 className="w-6 h-6 text-green-600" />}
              {isError && <XCircle className="w-6 h-6 text-red-600" />}
              {isAborted && <AlertTriangle className="w-6 h-6 text-amber-600" />}
              <DialogTitle className="text-lg font-semibold" data-testid="exec-status-title">
                {isSuccess && "Search Completed Successfully"}
                {isError && "Search Failed"}
                {isAborted && "Search Stopped"}
              </DialogTitle>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setIsExpanded(!isExpanded)} className="text-slate-500 hover:text-slate-700">
              {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
          </div>
        </DialogHeader>

        <ScrollArea className={`${isExpanded ? "h-[calc(80vh-140px)]" : "max-h-[60vh]"}`}>
          <div className="space-y-4 p-1">
            <div className={`p-4 rounded-lg ${
              isSuccess ? "bg-green-50 border border-green-200" :
              isError ? "bg-red-50 border border-red-200" :
              "bg-amber-50 border border-amber-200"
            }`}>
              <div className="flex items-start gap-3">
                <Info className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
                  isSuccess ? "text-green-600" : isError ? "text-red-600" : "text-amber-600"
                }`} />
                <div>
                  <p className={`font-medium ${
                    isSuccess ? "text-green-800" : isError ? "text-red-800" : "text-amber-800"
                  }`}>
                    {message || (isSuccess ? "Operation completed" : "An error occurred")}
                  </p>
                  {isSuccess && results_count !== undefined && (
                    <p className="text-green-700 text-sm mt-1">
                      Retrieved {results_count} reel{results_count !== 1 ? "s" : ""} matching your criteria
                    </p>
                  )}
                </div>
              </div>
            </div>

            {error && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <Label className="text-xs text-slate-500 uppercase tracking-wide">Error Type</Label>
                    <p className="font-medium text-slate-900 mt-1">{error.error_type || "Unknown"}</p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <Label className="text-xs text-slate-500 uppercase tracking-wide">Error Code</Label>
                    <p className="font-mono text-sm text-slate-900 mt-1">{error.error_code || "N/A"}</p>
                  </div>
                </div>
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-red-800">What happened?</p>
                      <p className="text-red-700 text-sm mt-1">{error.error_message}</p>
                    </div>
                  </div>
                </div>
                {error.possible_cause && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-amber-800">Possible Cause</p>
                        <p className="text-amber-700 text-sm mt-1">{error.possible_cause}</p>
                      </div>
                    </div>
                  </div>
                )}
                {error.suggested_solution && (
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-start gap-3">
                      <Lightbulb className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-blue-800">How to Fix</p>
                        <p className="text-blue-700 text-sm mt-1 whitespace-pre-line">{error.suggested_solution}</p>
                      </div>
                    </div>
                  </div>
                )}
                {error.technical_details && (
                  <Collapsible open={showTechnicalDetails} onOpenChange={setShowTechnicalDetails}>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" className="w-full justify-between text-slate-600 hover:text-slate-900 hover:bg-slate-100">
                        <span className="flex items-center gap-2">
                          <Code className="w-4 h-4" />
                          Technical Details
                        </span>
                        {showTechnicalDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="mt-2 p-4 bg-slate-900 rounded-lg relative">
                        <Button variant="ghost" size="sm" onClick={() => copyToClipboard(error.technical_details)}
                          className="absolute top-2 right-2 text-slate-400 hover:text-white h-8 px-2">
                          <Copy className="w-3 h-3 mr-1" />Copy
                        </Button>
                        <pre className="text-sm text-slate-300 font-mono overflow-x-auto whitespace-pre-wrap pr-16">
                          {error.technical_details}
                        </pre>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </div>
            )}

            {run_id && (
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div>
                  <Label className="text-xs text-slate-500 uppercase tracking-wide">Run ID</Label>
                  <p className="font-mono text-sm text-slate-700 mt-1">{run_id}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => copyToClipboard(run_id)} className="text-slate-500 hover:text-slate-700">
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <Button variant="outline" onClick={onClose} className="border-slate-200" data-testid="exec-status-close">Close</Button>
          {isError && (
            <Button onClick={onClose} className="bg-blue-600 hover:bg-blue-700 text-white" data-testid="exec-status-retry">Try Again</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
