// The runtimes the editor can deploy to and pull from. One is the active target; "Local (dev)" is always
// there and is the dev server's own runtime.
import { useState, useSyncExternalStore } from "react";
import {
  subscribeTargets, getTargets, getActiveTarget, setActiveTarget, addTarget, updateTarget, removeTarget, type Target,
} from "../store/targetsStore";
import { Button, Dialog, Field, IconButton, Input } from "../ui";
import { AddIcon, CheckIcon, CloseIcon, DeleteIcon, EditIcon } from "../ui/icons";

export function TargetsDialog({ onClose }: { onClose: () => void }) {
  const targets = useSyncExternalStore(subscribeTargets, getTargets);
  const active = useSyncExternalStore(subscribeTargets, getActiveTarget);

  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("http://");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editUrl, setEditUrl] = useState("");

  const addDisabled = !newName.trim() || !newUrl.trim() || newUrl === "http://";

  const handleAdd = () => {
    if (addDisabled) return;
    const t = addTarget(newName.trim(), newUrl.trim());
    setActiveTarget(t.id);
    setNewName(""); setNewUrl("http://");
  };

  const startEdit = (t: Target) => { setEditId(t.id); setEditName(t.name); setEditUrl(t.url); };
  const commitEdit = () => {
    if (editId) updateTarget(editId, { name: editName.trim(), url: editUrl.trim() });
    setEditId(null);
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
                  <IconButton label="Save target" size="sm" variant="primary" icon={<CheckIcon size={14} />} onClick={commitEdit} />
                  <IconButton label="Cancel editing" size="sm" icon={<CloseIcon size={14} />} onClick={() => setEditId(null)} />
                </>
              ) : (
                <>
                  <button type="button" role="radio" aria-checked={active.id === t.id} onClick={() => setActiveTarget(t.id)}
                    className="flex-1 min-w-0 text-left rounded focus-visible:outline-2 focus-visible:outline-blue-500">
                    <div className="text-ui font-medium text-zinc-100">{t.name}{active.id === t.id && <span className="ml-2 text-ui-label text-zinc-400">active</span>}</div>
                    <div className="truncate font-mono text-ui-label text-zinc-400">{t.url || "this computer, through the dev server"}</div>
                  </button>
                  {t.id !== "local" && (
                    <>
                      <IconButton label={`Edit ${t.name}`} size="sm" icon={<EditIcon size={14} />} onClick={() => startEdit(t)} />
                      <IconButton label={`Remove ${t.name}`} size="sm" icon={<DeleteIcon size={14} />} onClick={() => removeTarget(t.id)} />
                    </>
                  )}
                </>
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-zinc-700 pt-3 space-y-2">
          <div className="text-ui-label font-semibold uppercase tracking-wide text-zinc-400">Add a target</div>
          <div className="flex items-end gap-2">
            <Field label="Name" className="w-40"><Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Plant A" /></Field>
            <Field label="Address" hint="The runtime's base address, e.g. http://10.0.0.210:8080" className="flex-1">
              <Input mono value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="http://host:8080" />
            </Field>
            <Button variant="primary" icon={<AddIcon size={14} />} disabled={addDisabled} onClick={handleAdd}>Add</Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
