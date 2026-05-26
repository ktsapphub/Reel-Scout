import { useState, useEffect, useRef, useCallback } from "react";
import { safeGet, safeSet, safeRemove } from "@/lib/safeStorage";
import { toast } from "sonner";

const RUN_ID_KEY = "ig_reel_finder_runId";
const PROGRESS_KEY = "ig_reel_finder_progress";
const POLL_INTERVAL_MS = 3000;

/**
 * Encapsulates Apify search polling: start, stop, poll, and resume-on-mount.
 * Caller provides `api` (axios instance) and callbacks for completed/aborted runs.
 */
export function useSearchPolling({ api, onSucceeded, onAborted, onFailed, showExecutionResult }) {
  const [runId, setRunId] = useState(() => safeGet(RUN_ID_KEY));
  const [searching, setSearching] = useState(() => !!safeGet(RUN_ID_KEY));
  const [progress, setProgress] = useState(() => parseInt(safeGet(PROGRESS_KEY), 10) || 0);
  const [estimatedTime, setEstimatedTime] = useState(0);
  const [itemsProcessed, setItemsProcessed] = useState(0);
  const pollIntervalRef = useRef(null);

  // Persist runId/progress for resume across reloads
  useEffect(() => {
    if (runId) {
      safeSet(RUN_ID_KEY, runId);
      safeSet(PROGRESS_KEY, progress.toString());
    } else {
      safeRemove(RUN_ID_KEY);
      safeRemove(PROGRESS_KEY);
    }
  }, [runId, progress]);

  const clearPoll = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const pollSearchStatus = useCallback(async (searchRunId) => {
    try {
      const response = await api.get(`/reels/search/status/${searchRunId}`);
      const { status, progress: prog, estimated_seconds_remaining,
        results: searchResults, total, message: msg, error, items_processed } = response.data;
      setProgress(prog);
      setEstimatedTime(estimated_seconds_remaining);
      setItemsProcessed(items_processed || 0);

      if (status === "SUCCEEDED") {
        clearPoll();
        setSearching(false); setRunId(null); setProgress(100); setItemsProcessed(0);
        onSucceeded?.(searchResults || [], total, searchRunId);
        showExecutionResult?.("SUCCEEDED", msg || `Successfully retrieved ${total} reels`, null, total, searchRunId);
      } else if (status === "FAILED" || status === "TIMED-OUT") {
        clearPoll();
        setSearching(false); setRunId(null); setProgress(0); setItemsProcessed(0);
        onFailed?.(status, msg, error);
        showExecutionResult?.(status, msg, error, 0, searchRunId);
      } else if (status === "ABORTED") {
        clearPoll();
        setSearching(false); setRunId(null); setProgress(0); setItemsProcessed(0);
        onAborted?.();
        showExecutionResult?.("ABORTED", "Search was stopped by user", null, 0, searchRunId);
      }
    } catch {
      /* swallow; retry next tick */
    }
  }, [api, clearPoll, onSucceeded, onAborted, onFailed, showExecutionResult]);

  // Resume polling on mount when a saved runId is present
  useEffect(() => {
    const saved = safeGet(RUN_ID_KEY);
    if (saved && !pollIntervalRef.current) {
      setRunId(saved);
      setSearching(true);
      pollIntervalRef.current = setInterval(() => pollSearchStatus(saved), POLL_INTERVAL_MS);
    }
    return clearPoll;
  }, [pollSearchStatus, clearPoll]);

  const startPolling = useCallback((newRunId, initialEstimate = 0) => {
    setRunId(newRunId);
    setSearching(true);
    setProgress(0);
    setItemsProcessed(0);
    if (initialEstimate) setEstimatedTime(initialEstimate);
    clearPoll();
    pollIntervalRef.current = setInterval(() => pollSearchStatus(newRunId), POLL_INTERVAL_MS);
  }, [pollSearchStatus, clearPoll]);

  const stopSearch = useCallback(async () => {
    if (!runId) return;
    try {
      const response = await api.post(`/reels/search/stop/${runId}`);
      const { partial_results, items_processed: itemsCount, results_count, message: msg } = response.data;
      clearPoll();
      setSearching(false); setRunId(null); setProgress(0); setItemsProcessed(0);
      if (partial_results?.length > 0) {
        toast.success(`Stopped search. Retrieved ${results_count} reels from ${itemsCount} items processed.`);
        showExecutionResult?.("PARTIAL", msg, null, results_count, null);
        return { partial_results, results_count };
      }
      toast.info("Search stopped. No results were collected yet.");
      showExecutionResult?.("ABORTED", "Search stopped before any results were collected", null, 0, null);
      return null;
    } catch {
      toast.error("Failed to stop search");
      return null;
    }
  }, [api, runId, clearPoll, showExecutionResult]);

  const resetSearchingFlag = useCallback(() => {
    clearPoll();
    setSearching(false);
    setRunId(null);
    setProgress(0);
    setItemsProcessed(0);
  }, [clearPoll]);

  return {
    runId, searching, progress, estimatedTime, itemsProcessed,
    setSearching, setProgress, setItemsProcessed, setEstimatedTime,
    startPolling, stopSearch, pollSearchStatus, resetSearchingFlag,
  };
}
