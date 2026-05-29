import { CheckCircle2, AlertCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Small valid/invalid pill rendered absolute-right inside an input.
 * Hidden when the input is empty so we don't nag users.
 */
export function HandleValidityIndicator({ result, testId }) {
  if (!result || result.state === "empty") return null;
  if (result.state === "valid") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-600 inline-flex items-center gap-1"
            data-testid={testId || "handle-valid"}
          >
            <CheckCircle2 className="w-4 h-4" />
          </span>
        </TooltipTrigger>
        <TooltipContent><p className="text-xs">{result.message || "Valid Instagram handle"}</p></TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="absolute right-3 top-1/2 -translate-y-1/2 text-red-600 inline-flex items-center gap-1"
          data-testid={testId || "handle-invalid"}
        >
          <AlertCircle className="w-4 h-4" />
        </span>
      </TooltipTrigger>
      <TooltipContent><p className="text-xs">{result.message}</p></TooltipContent>
    </Tooltip>
  );
}
