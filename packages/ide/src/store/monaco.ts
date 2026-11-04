/// <reference types="vite/client" />
// The script editor's Monaco (Phase 4, decision 9), loaded only when a
// script editor opens. Autocomplete comes from the shared API definition,
// packages/script-api/api.d.ts, as globals for the kind of script edited.
import apiDts from "@speths-screens/script-api/api.d.ts?raw";

export type ScriptKind = "runtime" | "page";

const COMMON = ["readTag", "quality", "writeTag", "log", "emit"];
const ONLY: Record<ScriptKind, { iface: string; names: string[] }> = {
  runtime: { iface: "RuntimeScriptApi", names: ["state", "event"] },
  page: { iface: "PageScriptApi", names: ["navigate", "every", "after", "onTagChange", "on", "onTimer", "afterDelay"] },
};

/** The API definition as globals: the interfaces without `export`, and one
 *  `declare const` per name the kind of script has. */
export function ambientApi(kind: ScriptKind, dts: string = apiDts): string {
  const types = dts.replace(/^export /gm, "");
  const decl = (iface: string, n: string) => `declare const ${n}: ${iface}["${n}"];`;
  return [
    types,
    ...COMMON.map((n) => decl("CommonApi", n)),
    ...ONLY[kind].names.map((n) => decl(ONLY[kind].iface, n)),
  ].join("\n");
}

// TypeScript complaints that do not apply: the source is the body of an
// async function, so top-level await and return are fine.
const IGNORE = [1108, 1375, 1378];

type Monaco = typeof import("monaco-editor");
let loading: Promise<Monaco> | undefined;

export function loadMonaco(): Promise<Monaco> {
  loading ??= (async () => {
    const [monaco, { default: EditorWorker }, { default: TsWorker }] = await Promise.all([
      import("monaco-editor"),
      import("monaco-editor/editor/editor.worker?worker"),
      import("monaco-editor/languages/features/typescript/ts.worker?worker"),
    ]);
    (self as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = {
      getWorker: (_id: string, label: string) => (label === "typescript" || label === "javascript" ? new TsWorker() : new EditorWorker()),
    };
    const js = monaco.typescript.javascriptDefaults;
    // No DOM library: page scripts have no window, and fetch is not offered.
    js.setCompilerOptions({ target: monaco.typescript.ScriptTarget.ES2020, allowNonTsExtensions: true, lib: ["es2020"], checkJs: false });
    js.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: false, diagnosticCodesToIgnore: IGNORE });
    return monaco;
  })();
  return loading;
}

/** Points autocomplete at this kind of script's names. */
export function setScriptApi(monaco: Monaco, kind: ScriptKind): void {
  monaco.typescript.javascriptDefaults.setExtraLibs([{ content: ambientApi(kind), filePath: "file:///script-api.d.ts" }]);
}
