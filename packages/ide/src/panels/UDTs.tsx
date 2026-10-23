import { useState } from "react";
import { useProject, type UDT, type UDTField } from "../store/projectStore";

const uid = () => `udt-${Math.random().toString(36).slice(2, 8)}`;
const fid = () => `f-${Math.random().toString(36).slice(2, 8)}`;

const FIELD_TYPES: UDTField["type"][] = ["bool", "int", "real", "string"];

const inp = "w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-zinc-500";

function FieldRow({
  field,
  onChange,
  onRemove,
}: {
  field: UDTField;
  onChange: (patch: Partial<UDTField>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex gap-1 items-center">
      <input
        value={field.name}
        onChange={(e) => onChange({ name: e.target.value })}
        placeholder="fieldName"
        className="w-24 bg-zinc-900 border border-zinc-700 rounded px-2 py-0.5 text-[11px] font-mono focus:outline-none"
      />
      <select
        value={field.type}
        onChange={(e) => onChange({ type: e.target.value as UDTField["type"] })}
        className="w-16 bg-zinc-900 border border-zinc-700 rounded px-1 py-0.5 text-[10px]"
      >
        {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <input
        value={field.unit ?? ""}
        onChange={(e) => onChange({ unit: e.target.value || undefined })}
        placeholder="unit"
        className="w-12 bg-zinc-900 border border-zinc-700 rounded px-2 py-0.5 text-[10px] font-mono focus:outline-none"
      />
      <button onClick={onRemove} className="text-zinc-600 hover:text-red-400 text-xs">×</button>
    </div>
  );
}

function UDTCard({ udt }: { udt: UDT }) {
  const { updateUDT, removeUDT } = useProject();
  const [open, setOpen] = useState(false);

  const setFields = (fields: UDTField[]) => updateUDT(udt.id, { fields });

  const addField = () => setFields([
    ...udt.fields,
    { name: `field${udt.fields.length + 1}`, type: "real" as const },
  ]);

  const updateField = (i: number, patch: Partial<UDTField>) =>
    setFields(udt.fields.map((f, j) => j === i ? { ...f, ...patch } : f));

  const removeField = (i: number) => setFields(udt.fields.filter((_, j) => j !== i));

  return (
    <div className="border border-zinc-700/50 rounded-lg overflow-hidden">
      <div
        className="flex items-center gap-2 px-3 py-2 bg-zinc-800/40 cursor-pointer hover:bg-zinc-800/60"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-[10px] text-zinc-500 w-3">{open ? "▾" : "▸"}</span>
        <input
          value={udt.name}
          onChange={(e) => { e.stopPropagation(); updateUDT(udt.id, { name: e.target.value }); }}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 bg-transparent text-xs font-medium text-zinc-200 outline-none"
          placeholder="UDT Name"
        />
        <span className="text-[10px] text-zinc-600">{udt.fields.length} fields</span>
        <button
          onClick={(e) => { e.stopPropagation(); removeUDT(udt.id); }}
          className="text-zinc-600 hover:text-red-400 text-xs"
        >
          ×
        </button>
      </div>

      {open && (
        <div className="px-3 py-2 space-y-2 bg-zinc-900/30">
          <input
            value={udt.description ?? ""}
            onChange={(e) => updateUDT(udt.id, { description: e.target.value || undefined })}
            placeholder="Description (optional)"
            className={`${inp} text-[10px]`}
          />
          <div className="space-y-1.5">
            <div className="grid grid-cols-[6rem_4rem_3rem_1.5rem] gap-1 text-[9px] uppercase tracking-wider text-zinc-600 px-0.5">
              <span>Name</span><span>Type</span><span>Unit</span><span></span>
            </div>
            {udt.fields.map((f, i) => (
              <FieldRow
                key={fid() + i}
                field={f}
                onChange={(p) => updateField(i, p)}
                onRemove={() => removeField(i)}
              />
            ))}
            {udt.fields.length === 0 && (
              <div className="text-[10px] text-zinc-600 italic">No fields yet.</div>
            )}
          </div>
          <button
            onClick={addField}
            className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400"
          >
            + Add Field
          </button>
        </div>
      )}
    </div>
  );
}

export function UDTs() {
  const { project, addUDT } = useProject();
  const udts = project.udts ?? [];

  const handleAdd = () => addUDT({
    id: uid(),
    name: `UDT ${udts.length + 1}`,
    fields: [],
  });

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500">UDT Templates</div>
        <button
          onClick={handleAdd}
          className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700"
        >
          + New UDT
        </button>
      </div>

      {udts.length === 0 && (
        <div className="text-[11px] text-zinc-600 italic">No UDT templates yet.</div>
      )}

      <div className="space-y-2">
        {udts.map((udt) => <UDTCard key={udt.id} udt={udt} />)}
      </div>
    </div>
  );
}
