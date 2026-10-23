// Bottom status bar: WS connection indicator + datasource health summary.
import { useEffect, useState } from "react";
import { tagStoreClient } from "../store/tagStoreClient";
import { apiBase } from "../store/runtimeTarget";
import { useProject } from "../store/projectStore";

type DSStatus = { connected: boolean; lastError: string; tagCount: number };

export function StatusBar() {
  const { project } = useProject();
  const [wsOk, setWsOk] = useState(false);
  const [dsStatus, setDsStatus] = useState<Record<string, DSStatus>>({});

  // Poll WS connection state via tagStoreClient
  useEffect(() => {
    const id = setInterval(() => setWsOk(tagStoreClient.isConnected()), 1500);
    setWsOk(tagStoreClient.isConnected());
    return () => clearInterval(id);
  }, []);

  // Poll datasource status every 4 s
  useEffect(() => {
    const poll = async () => {
      const next: Record<string, DSStatus> = {};
      await Promise.all(
        project.datasources.map(async (ds) => {
          try {
            const r = await fetch(`${apiBase}/api/v1/datasources/${ds.id}/status`);
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
      {/* WebSocket indicator */}
      <div className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${wsOk ? "bg-emerald-500" : "bg-red-500 animate-pulse"}`} />
        <span className={wsOk ? "text-emerald-500" : "text-red-400"}>
          {wsOk ? "WS connected" : "WS disconnected"}
        </span>
      </div>

      {/* Target */}
      {apiBase && (
        <span className="text-zinc-600 truncate max-w-[180px]">{apiBase}</span>
      )}

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
