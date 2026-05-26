import { useEffect, useState } from "react";
import { Timer } from "lucide-react";

const formatRemaining = (seconds) => {
  if (seconds <= 0) return "expired";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }
  if (m >= 1) return `${m}m ${s}s`;
  return `${s}s`;
};

export function ValidityPill({ validUntil, validityMinutes, connected }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!validUntil || connected !== true) return null;
  const remainingSec = Math.max(0, Math.floor((new Date(validUntil).getTime() - now) / 1000));
  const totalSec = (validityMinutes || 60) * 60;
  const pct = Math.max(0, Math.min(100, (remainingSec / totalSec) * 100));
  const expired = remainingSec === 0;

  let toneText = "text-emerald-700";
  let toneBg = "bg-emerald-50 border-emerald-200";
  let toneBar = "bg-emerald-500";
  if (pct < 30) { toneText = "text-amber-700"; toneBg = "bg-amber-50 border-amber-200"; toneBar = "bg-amber-500"; }
  if (expired) { toneText = "text-red-700"; toneBg = "bg-red-50 border-red-200"; toneBar = "bg-red-500"; }

  return (
    <div
      className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-md border text-xs ${toneBg} ${toneText}`}
      data-testid="validity-pill"
    >
      <Timer className="w-3 h-3" />
      <span className="font-medium">
        {expired ? "Re-verify needed" : `Valid for ${formatRemaining(remainingSec)}`}
      </span>
      <div className="w-12 h-1 bg-white/60 rounded-full overflow-hidden">
        <div className={`h-full ${toneBar} transition-all duration-1000`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
