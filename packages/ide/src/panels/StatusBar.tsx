// Bottom status bar: whether a runtime answers, the live-data connection, and datasource health.
import { useEffect, useState } from "react";
import { apiBase } from "../store/runtimeTarget";
import { reachLabel, useRuntimeReach } from "../store/runtimeReach";
import { authHeader } from "../store/runtimeAuth";
import { useProject } from "../store/projectStore";

type DSStatus = { connected: boolean; lastError: string; tagCount: number };

export function StatusBar() {
  const { project } = useProject();
  // Whether a runtime answers at the target at all; the live-data connection only opens when a screen
  // reads a tag from a datasource, so it can be closed while the runtime is fine.
  const reach = useRuntimeReach();
  const { reachable, streaming: wsOk } = reach;
  const [dsStatus, setDsStatus] = useState<Record<string, DSStatus>>({});

  // Poll datasource status every 4 s
  useEffect(() => {
    const poll = async () => {
      const next: Record<string, DSStatus> = {};
      await Promise.all(
        project.datasources.map(async (ds) => {
          try {
            const r = await fetch(`${apiBase}/api/v1/datasources/${ds.id}/status`, { headers: authHeader(apiBase) });
            if (r.ok) next[ds.id] = (await r.json()) as DSStatus;
          } catch { /* ignore */ }
        }),
      );
      setDsStatus(next);
    };
    void poll();
    const id = setInterval(poll, 4000);
    return () => clearInterval(id);
  }, [project.datasources]);

  const connectedDs = Object.values(dsStatus).filter((s) => s.connected).length;
  const totalDs = project.datasources.length;
  const errorDs = Object.values(dsStatus).filter((s) => !s.connected && s.lastError).length;

  return (
    <div className="flex items-center gap-4 px-4 py-1 bg-zinc-900 border-t border-zinc-800 text-[10px] font-mono text-zinc-500 shrink-0">
      {/* Runtime and live-data indicator */}
      <div className="flex items-center gap-1.5" title={
        reachable === false
          ? "Nothing answers at this address, so Deploy, Pull and live values will not work. Start a runtime on this PC with: go run ./cmd/speths-screens --mode=dev --project=<file>"
          : wsOk ? "Live values are streaming from the runtime" : "The runtime answers. Live values stream when a screen reads a tag from a datasource."
      }>
        <span className={`w-1.5 h-1.5 rounded-full ${reachable === false ? "bg-red-500 animate-pulse" : reachable ? "bg-emerald-500" : "bg-zinc-500"}`} />
        <span className={reachable === false ? "text-red-400" : reachable ? "text-emerald-500" : ""}>
          {reachLabel(reach)}
        </span>
      </div>

      {/* Target */}
      <span className="text-zinc-600 truncate max-w-[220px]">{apiBase || `${location.host} (${import.meta.env.DEV ? "dev server" : "this runtime"})`}</span>

      {/* Datasource health */}
      {totalDs > 0 && (
        <div className="flex items-center gap-1.5">
          <span className={connectedDs === totalDs ? "text-emerald-500" : errorDs > 0 ? "text-red-400" : "text-amber-400"}>
            DS {connectedDs}/{totalDs}
          </span>
          {Object.entries(dsStatus).map(([id, st]) => (
            <span key={id} title={st.lastError || "connected"}>
              <span className={`w-1.5 h-1.5 rounded-full inline-block ${st.connected ? "bg-emerald-500" : "bg-red-500"}`} />
              <span className="ml-0.5">{id}</span>
            </span>
          ))}
        </div>
      )}

      <div className="flex-1" />

      {/* Total tag count */}
      {Object.values(dsStatus).some((s) => s.tagCount > 0) && (
        <span className="text-zinc-600">
          {Object.values(dsStatus).reduce((a, s) => a + s.tagCount, 0)} tags
        </span>
      )}
    </div>
  );
}
