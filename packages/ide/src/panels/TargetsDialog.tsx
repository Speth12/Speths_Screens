// The runtimes the editor can deploy to and pull from. One is the active target; the first is always the
// program that served the editor (the runtime on this PC, or the dev server's runtime). The others are saved by
// that program, which passes the editor's requests on to them.
import { useState, useSyncExternalStore } from "react";
import {
  subscribeTargets, getTargets, getActiveTarget, getTargetsUnavailable, setActiveTarget, addTarget, updateTarget, removeTarget, type Target,
} from "../store/targetsStore";
import { Button, Dialog, Field, IconButton, Input } from "../ui";
import { AddIcon, CheckIcon, CloseIcon, DeleteIcon, EditIcon } from "../ui/icons";

export function TargetsDialog({ onClose }: { onClose: () => void }) {
  const targets = useSyncExternalStore(subscribeTargets, getTargets);
  const active = useSyncExternalStore(subscribeTargets, getActiveTarget);
  const unavailable = useSyncExternalStore(subscribeTargets, getTargetsUnavailable);

  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("http://");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const addDisabled = busy || !!unavailable || !newUrl.trim() || newUrl.trim() === "http://";

  // The program checks the address and keeps the target; what it refuses is shown as it says it.
  const attempt = async (what: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await what(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const handleAdd = () => {
    if (addDisabled) return;
    void attempt(async () => {
      const t = await addTarget(newName.trim(), newUrl.trim());
      setActiveTarget(t.id);
      setNewName(""); setNewUrl("http://");
    });
  };

  const startEdit = (t: Target) => { setEditId(t.id); setEditName(t.name); setEditUrl(t.url); setError(""); };
  const commitEdit = () => {
    const id = editId;
    if (!id) return;
    void attempt(async () => {
      await updateTarget(id, { name: editName.trim(), url: editUrl.trim() });
      setEditId(null);
    });
  };

  return (
    <Dialog title="Deploy targets" size="md" onClose={onClose} footer={<Button onClick={onClose}>Done</Button>}>
      <div className="space-y-4">
        <div role="radiogroup" aria-label="Active target" className="space-y-1.5">
          {targets.map((t) => (
            <div key={t.id} className={`flex items-center gap-2 rounded border px-3 py-2 ${active.id === t.id ? "border-blue-500 bg-blue-950" : "border-zinc-700"}`}>
              {editId === t.id ? (
                <>
                  <Input aria-label="Target name" className="w-36" value={editName} onChange={(e) => setEditName(e.target.value)} />
                  <Input aria-label="Target address" mono className="flex-1" value={editUrl} onChange={(e) => setEditUrl(e.target.value)} placeholder="http://host:8080" />
                  <IconButton label="Save target" size="sm" variant="primary" icon={<CheckIcon size={14} />} disabled={busy} onClick={commitEdit} />
                  <IconButton label="Cancel editing" size="sm" icon={<CloseIcon size={14} />} onClick={() => setEditId(null)} />
                </>
              ) : (
                <>
                  <button type="button" role="radio" aria-checked={active.id === t.id} onClick={() => setActiveTarget(t.id)}
                    className="flex-1 min-w-0 text-left rounded focus-visible:outline-2 focus-visible:outline-blue-500">
                    <div className="text-ui font-medium text-zinc-100">{t.name}{active.id === t.id && <span className="ml-2 text-ui-label text-zinc-400">active</span>}</div>
                    <div className="truncate font-mono text-ui-label text-zinc-400">{t.url || (import.meta.env.DEV ? "this computer, through the dev server" : "the runtime this page came from")}</div>
                  </button>
                  {t.id !== "local" && (
                    <>
                      <IconButton label={`Edit ${t.name}`} size="sm" icon={<EditIcon size={14} />} onClick={() => startEdit(t)} />
                      <IconButton label={`Remove ${t.name}`} size="sm" icon={<DeleteIcon size={14} />} disabled={busy} onClick={() => void attempt(() => removeTarget(t.id))} />
                    </>
                  )}
                </>
              )}
            </div>
          ))}
        </div>

        {error && <div role="alert" className="text-ui text-red-500">{error}</div>}

        <div className="border-t border-zinc-700 pt-3 space-y-2">
          <div className="text-ui-label font-semibold uppercase tracking-wide text-zinc-400">Add a target</div>
          {unavailable ? (
            <div role="note" className="text-ui text-zinc-400">{unavailable}</div>
          ) : (
            <div className="flex items-end gap-2">
              <Field label="Name" className="w-40"><Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Panel" /></Field>
              <Field label="Address" hint="The other runtime's address, e.g. http://10.0.0.120:8090. It only has to be reachable from the computer this editor's runtime is on." className="flex-1">
                <Input mono value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="http://host:8090" />
              </Field>
              <Button variant="primary" icon={<AddIcon size={14} />} disabled={addDisabled} onClick={handleAdd}>Add</Button>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
