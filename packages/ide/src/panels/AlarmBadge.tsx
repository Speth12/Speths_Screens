// A small count of the alarms that need a person, for the project tree. It polls the runtime and
// shows nothing while there are none or no runtime answers.
import { useEffect, useState } from "react";
import type { AlarmSeverity } from "../store/projectStore";
import { apiFetch } from "../store/runtimeAuth";
import { needsAttention, type AlarmEvent } from "../store/alarmFeed";
import { WarningIcon } from "../ui/icons";

export function AlarmBadge() {
  const [activeCount, setActiveCount] = useState(0);
  const [worstSeverity, setWorstSeverity] = useState<AlarmSeverity | null>(null);

  useEffect(() => {
    const poll = async () => {
      try {
        const r = await apiFetch(`/api/v1/alarms`);
        if (!r.ok) return;
        const events: AlarmEvent[] = await r.json();
        const active = events.filter(needsAttention);
        setActiveCount(active.length);
        if (active.some((e) => e.severity === "critical")) setWorstSeverity("critical");
        else if (active.some((e) => e.severity === "warning")) setWorstSeverity("warning");
        else if (active.length > 0) setWorstSeverity("info");
        else setWorstSeverity(null);
      } catch { /* runtime not running */ }
    };
    void poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, []);

  if (activeCount === 0) return null;

  return (
    <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-ui-label font-semibold ${
      worstSeverity === "critical" ? "bg-red-700 text-white animate-pulse"
      : worstSeverity === "warning" ? "bg-amber-700 text-white"
      : "bg-blue-700 text-white"
    }`}>
      <WarningIcon size={12} /> {activeCount} alarm{activeCount !== 1 ? "s" : ""}
    </div>
  );
}
