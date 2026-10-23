import { useState } from "react";
import { useProject } from "../store/projectStore";
import { apiBase } from "../store/runtimeTarget";

function curlCmd(url: string, id: number, method: string, params?: string): string {
  const body = params
    ? `{"jsonrpc":"2.0","id":${id},"method":"${method}","params":${params}}`
    : `{"jsonrpc":"2.0","id":${id},"method":"${method}"}`;
  return [
    `curl -X POST ${url}`,
    `  -H "Content-Type: application/json"`,
    `  -d '${body}'`,
  ].join(" \\\n");
}

export function MCPModal({ onClose }: { onClose: () => void }) {
  const { project } = useProject();
  const base = apiBase.replace(/\/$/, "");
  const mcpUrl = `${base}/mcp`;

  const claudeConfig = JSON.stringify(
    { mcpServers: { "x-hmi": { type: "http", url: mcpUrl } } },
    null,
    2,
  );
  const cliCmd = `claude mcp add --transport http x-hmi ${mcpUrl}`;
  const curlList = curlCmd(mcpUrl, 1, "tools/list");
  const curlCall = curlCmd(
    mcpUrl, 2, "tools/call",
    '{"name":"list_alarms","arguments":{}}',
  );

  const [tab, setTab] = useState<"setup" | "tools" | "curl">("setup");
  const [copied, setCopied] = useState(false);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const tools = [
    { name: "read_tag",          desc: 'Read live value. Args: binding ("dsId:path")' },
    { name: "write_tag",         desc: "Write a value. Args: binding, value" },
    { name: "list_alarms",       desc: "List all active alarms" },
    { name: "acknowledge_alarm", desc: "Ack alarm by id" },
    { name: "list_recipes",      desc: "List all defined recipes" },
    { name: "apply_recipe",      desc: "Apply recipe by id or name" },
    { name: "query_history",     desc: "Query historian. Args: binding, from?, to?, limit?" },
    { name: "get_project_info",  desc: "Summary: pages, datasources, alarm rules" },
    { name: "navigate_page",     desc: "Broadcast page navigation to HMI screens" },
  ];

  const tabCls = (t: typeof tab) =>
    `text-[10px] uppercase tracking-wider px-3 py-1.5 transition-colors ${
      tab === t ? "text-zinc-100 border-b-2 border-blue-500" : "text-zinc-500 hover:text-zinc-300"
    }`;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl w-[580px] max-h-[80vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2 shrink-0">
          <div>
            <div className="font-semibold text-sm">MCP Server</div>
            <div className="text-[10px] text-zinc-500 mt-0.5 font-mono">{mcpUrl}</div>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-lg leading-none">×</button>
        </div>

        {/* Status */}
        <div className="px-5 pb-2 shrink-0">
          <div className="flex items-center gap-2 text-[11px] text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
            MCP endpoint live on the Go runtime — no adapter needed
          </div>
          {project.name && (
            <div className="text-[10px] text-zinc-600 mt-0.5">Project: {project.name}</div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-800 px-2 shrink-0">
          <button className={tabCls("setup")} onClick={() => setTab("setup")}>Claude Code Setup</button>
          <button className={tabCls("tools")} onClick={() => setTab("tools")}>Tools</button>
          <button className={tabCls("curl")} onClick={() => setTab("curl")}>Test with curl</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto min-h-0 p-5">
          {tab === "setup" && (
            <div className="space-y-3">
              <div className="text-[11px] text-zinc-400 leading-relaxed">
                Add this to your <code className="text-zinc-300">~/.claude.json</code> (or run{" "}
                <code className="text-zinc-300">claude mcp add</code>):
              </div>
              <pre className="text-[11px] font-mono text-zinc-300 bg-zinc-950 rounded-lg p-3 whitespace-pre-wrap">
                {claudeConfig}
              </pre>
              <button
                onClick={() => copy(claudeConfig)}
                className="w-full text-xs py-1.5 rounded bg-blue-600 hover:bg-blue-500 font-medium"
              >
                {copied ? "Copied!" : "Copy config"}
              </button>
              <div className="text-[10px] text-zinc-600 leading-relaxed space-y-1">
                <div>Or via CLI:</div>
                <pre className="text-zinc-500 bg-zinc-950 rounded p-2 font-mono text-[10px]">
                  {cliCmd}
                </pre>
              </div>
            </div>
          )}

          {tab === "tools" && (
            <div className="space-y-1">
              {tools.map((t) => (
                <div key={t.name} className="flex gap-3 py-1.5 border-b border-zinc-800/60">
                  <code className="text-[11px] text-blue-400 font-mono shrink-0 w-40">{t.name}</code>
                  <span className="text-[11px] text-zinc-400">{t.desc}</span>
                </div>
              ))}
              <div className="text-[10px] text-zinc-600 pt-2">
                Resources: <code className="text-zinc-500">xhmi://project</code>,{" "}
                <code className="text-zinc-500">xhmi://pages</code>,{" "}
                <code className="text-zinc-500">xhmi://page/:id</code>,{" "}
                <code className="text-zinc-500">xhmi://alarms</code>,{" "}
                <code className="text-zinc-500">xhmi://recipes</code>,{" "}
                <code className="text-zinc-500">xhmi://datasources</code>
              </div>
            </div>
          )}

          {tab === "curl" && (
            <div className="space-y-3">
              <div className="text-[11px] text-zinc-400">List tools:</div>
              <pre className="text-[11px] font-mono text-zinc-300 bg-zinc-950 rounded-lg p-3 whitespace-pre-wrap">
                {curlList}
              </pre>
              <button
                onClick={() => copy(curlList)}
                className="w-full text-xs py-1.5 rounded bg-zinc-700 hover:bg-zinc-600 font-medium"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
              <div className="text-[11px] text-zinc-400">Call a tool:</div>
              <pre className="text-[11px] font-mono text-zinc-300 bg-zinc-950 rounded-lg p-3 whitespace-pre-wrap">
                {curlCall}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
