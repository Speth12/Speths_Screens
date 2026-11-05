// The languages the screens can be shown in, and what each says. The first language is the one the
// project's text is written in; every other language gets a table from that text to its translation.
import { useMemo, useState } from "react";
import { collectTexts } from "@speths-screens/widgets";
import { useProject } from "../store/projectStore";
import { useEditorView } from "../store/editorView";

const CODE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;

export function LanguagesPanel({ onClose }: { onClose: () => void }) {
  const project = useProject((s) => s.project);
  const setLanguages = useProject((s) => s.setLanguages);
  const setTranslation = useProject((s) => s.setTranslation);
  const view = useEditorView();
  const languages = project.languages ?? [];
  const [adding, setAdding] = useState("");
  const [shown, setShown] = useState<string | null>(null);
  const texts = useMemo(() => collectTexts(project), [project]);

  const others = languages.slice(1);
  const editing = shown && others.includes(shown) ? shown : others[0];
  const table = (editing && project.translations?.[editing]) || {};
  const done = editing ? texts.filter((t) => table[t]).length : 0;
  const problem = adding && !CODE.test(adding) ? "Use a language code such as en, de or es." : adding && languages.includes(adding) ? "Already added." : "";

  const add = () => {
    if (!adding || problem) return;
    setLanguages([...languages, adding]);
    setShown(adding);
    setAdding("");
  };

  return (
    <div className="fixed left-0 top-10 bottom-0 z-40 w-[min(760px,70vw)] flex flex-col bg-zinc-950 border-r border-zinc-700 shadow-2xl">
      <div className="flex items-center gap-3 px-3 py-2 border-b border-zinc-800">
        <div className="text-xs font-semibold text-zinc-200">Languages</div>
        <span className="text-[10px] text-zinc-500">{languages.length ? `${languages.length} language${languages.length > 1 ? "s" : ""}; the operator screen offers a switch from two` : "none yet: the screens show their text as written"}</span>
        <button aria-label="Close languages" onClick={onClose} className="ml-auto text-zinc-500 hover:text-zinc-200 text-sm px-1">×</button>
      </div>
      <div className="flex-1 overflow-auto p-3 flex flex-col gap-4">
        <section>
          <div className="flex flex-wrap items-center gap-2">
            {languages.map((code, i) => (
              <span key={code} className="inline-flex items-center gap-1 rounded bg-zinc-800 border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-200">
                {code}{i === 0 && <span className="text-zinc-500">(written in)</span>}
                <button aria-label={`Remove ${code}`} onClick={() => setLanguages(languages.filter((c) => c !== code))} className="text-zinc-500 hover:text-red-400">×</button>
              </span>
            ))}
            <input aria-label="New language code" placeholder="de" value={adding} onChange={(e) => setAdding(e.target.value.trim())}
              onKeyDown={(e) => { if (e.key === "Enter") add(); }}
              className="w-20 text-[11px] bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-zinc-200" />
            <button onClick={add} disabled={!adding || !!problem} className="text-[11px] px-2 py-0.5 rounded bg-blue-700 text-white disabled:opacity-40">Add language</button>
            {problem && <span className="text-[11px] text-amber-400">{problem}</span>}
          </div>
          {languages.length > 1 && (
            <label className="mt-2 flex items-center gap-2 text-[11px] text-zinc-400">Show the editor in
              <select aria-label="Preview language" value={view.language ?? languages[0]} onChange={(e) => view.setLanguage(e.target.value)}
                className="text-[11px] bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-zinc-200">
                {languages.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <span className="text-zinc-600">(not saved in the project)</span>
            </label>
          )}
        </section>

        {others.length > 0 && (
          <section className="flex-1 min-h-0 flex flex-col">
            <div className="flex items-center gap-2 mb-1.5">
              <h3 className="text-[11px] font-semibold text-zinc-400">Translate into</h3>
              <select aria-label="Translating into" value={editing} onChange={(e) => setShown(e.target.value)}
                className="text-[11px] bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-zinc-200">
                {others.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <span className="text-[10px] text-zinc-500">{done} of {texts.length} done</span>
            </div>
            <div className="overflow-auto rounded border border-zinc-800">
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-zinc-900 text-zinc-400"><tr><th className="text-left px-2 py-1 w-1/2">{languages[0]}</th><th className="text-left px-2 py-1">{editing}</th></tr></thead>
                <tbody>
                  {texts.map((t) => (
                    <tr key={t} className="border-t border-zinc-800">
                      <td className="px-2 py-1 text-zinc-300 align-top">{t}</td>
                      <td className="px-1 py-0.5">
                        <input aria-label={`${editing} for ${t}`} value={table[t] ?? ""} onChange={(e) => setTranslation(editing!, t, e.target.value)}
                          className="w-full text-[11px] bg-zinc-900 border border-zinc-800 rounded px-1 py-0.5 text-zinc-200" />
                      </td>
                    </tr>
                  ))}
                  {texts.length === 0 && <tr><td colSpan={2} className="px-2 py-3 text-zinc-500">No text in the project yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
