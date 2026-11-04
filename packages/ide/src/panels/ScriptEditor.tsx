// A script source editor: Monaco with the script API's autocomplete once it
// has loaded, a plain text area until then (and if it cannot load).
import { useEffect, useRef, useState } from "react";
import { loadMonaco, setScriptApi, type ScriptKind } from "../store/monaco";

type Editor = import("monaco-editor").editor.IStandaloneCodeEditor;

export function ScriptEditor({ value, onChange, kind, label, rows = 10 }: {
  value: string;
  onChange: (source: string) => void;
  kind: ScriptKind;
  label: string;
  rows?: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<Editor | null>(null);
  const changed = useRef(onChange);
  const initial = useRef(value);
  const [ready, setReady] = useState(false);
  useEffect(() => { changed.current = onChange; }, [onChange]);

  useEffect(() => {
    let disposed = false;
    loadMonaco().then((monaco) => {
      if (disposed || !host.current) return;
      setScriptApi(monaco, kind);
      const e = monaco.editor.create(host.current, {
        value: initial.current, language: "javascript", theme: "vs-dark", fontSize: 11,
        minimap: { enabled: false }, lineNumbers: "on", scrollBeyondLastLine: false,
        automaticLayout: true, tabSize: 2, wordWrap: "on",
      });
      e.onDidChangeModelContent(() => changed.current(e.getValue()));
      editor.current = e;
      setReady(true);
    }).catch((err: unknown) => console.warn("[Script] editor not loaded; using a text area", err));
    return () => {
      disposed = true;
      editor.current?.dispose();
      editor.current = null;
    };
  }, [kind]);

  // A change from outside (undo, another panel) reaches the editor.
  useEffect(() => {
    initial.current = value; // what the editor starts from if it loads later
    const e = editor.current;
    if (e && e.getValue() !== value) e.setValue(value);
  }, [value]);

  return (
    <>
      <div ref={host} style={{ height: rows * 16 }} className={ready ? "border border-zinc-800 rounded overflow-hidden" : "hidden"} />
      {!ready && (
        <textarea aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false} rows={rows}
          className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[11px] font-mono leading-snug resize-y" />
      )}
    </>
  );
}
