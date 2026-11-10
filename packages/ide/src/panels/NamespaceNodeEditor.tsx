// The dialog for one namespace node: its path (new nodes only), type, source variable, unit, data type and description.
// With a memory datasource as the source, a new node also makes the memory variable it names: the form asks for the
// variable's type, its starting value and whether to keep it across restarts, and the datasource gets the tag.
import { useState } from "react";
import type { MemoryTag, NamespaceNode, NamespaceNodeType, Type } from "@speths-screens/shared-types";
import { nsLeaf } from "../store/namespaceOps";
import { MEMORY_TYPES, NS_DATA_TYPE } from "../store/memoryVars";
import { typedInitial } from "./typedInitial";
import { Button, Checkbox, Dialog, Field, Input, Select } from "../ui";

/** A datasource the node can come from; `memoryTags` are the names a memory datasource already has. */
export type NodeSource = { id: string; label: string; type: string; memoryTags?: string[] };

const TYPE_HELP: Record<Type, string> = {
  bool: "true or false",
  int: "a whole number",
  real: "a number with decimals",
  string: "text",
};

export function NamespaceNodeEditor({
  node,
  datasources,
  onSave,
  onCancel,
}: {
  node: Partial<NamespaceNode> & { path: string };
  datasources: NodeSource[];
  /** `memory` is set when the node makes a memory variable: add it to the node's datasource as well. */
  onSave: (n: NamespaceNode, memory?: MemoryTag) => void;
  onCancel: () => void;
}) {
  const [path, setPath] = useState(node.path);
  const [type, setType] = useState<NamespaceNodeType>(node.type ?? "tag");
  const [driverId, setDriverId] = useState(node.driverId ?? "");
  const [driverAddr, setDriverAddr] = useState(node.driverAddr ?? "");
  const [description, setDescription] = useState(node.description ?? "");
  const [unit, setUnit] = useState(node.unit ?? "");
  const [dataType, setDataType] = useState(node.dataType ?? "");
  const [varType, setVarType] = useState<Type>("real");
  const [initial, setInitial] = useState("");
  const [retain, setRetain] = useState(false);

  const isNew = !node.driverId && !node.driverAddr;
  const source = datasources.find((d) => d.id === driverId);
  const named = type === "tag" || type === "virtual";
  const memory = isNew && named && source?.type === "memory";

  // A memory variable is named like the node unless another name is typed.
  const address = driverAddr.trim() || (memory ? nsLeaf(path.trim()) : "");
  const exists = memory && !!source?.memoryTags?.includes(address);
  const creates = memory && !exists && address !== "";
  const initialValue = creates ? typedInitial(varType, initial) : undefined;
  const badInitial = creates && initial.trim() !== "" && initialValue === undefined;

  const problem = !path.trim() ? "Give the node a path." : badInitial ? `The starting value is not ${TYPE_HELP[varType]}.` : "";

  const save = () => {
    if (problem) return;
    const n: NamespaceNode = {
      path: path.trim(),
      type,
      driverId: driverId || undefined,
      driverAddr: address || undefined,
      description: description || undefined,
      unit: unit || undefined,
      dataType: (creates ? NS_DATA_TYPE[varType] : dataType) || undefined,
    };
    const tag: MemoryTag | undefined = creates
      ? { path: address, type: varType, ...(initialValue !== undefined ? { initial: initialValue } : {}), ...(retain ? { retain: true } : {}) }
      : undefined;
    onSave(n, tag);
  };

  return (
    <Dialog title={isNew ? "New node" : "Edit node"} size="md" onClose={onCancel}
      footer={<><Button onClick={onCancel}>Cancel</Button><Button variant="primary" disabled={!!problem} onClick={save}>Save</Button></>}>
    <div className="space-y-3">
      <Field label="Path (dot-separated)">
        <Input mono value={path} onChange={(e) => setPath(e.target.value)} placeholder="Building1.System1.Tank5.Level" disabled={!isNew} />
      </Field>

      <Field label="Type">
        <Select value={type} onChange={(e) => setType(e.target.value as NamespaceNodeType)}>
          <option value="folder">Folder</option>
          <option value="asset">Asset</option>
          <option value="tag">Tag</option>
          <option value="virtual">Virtual</option>
        </Select>
      </Field>

      {named && (
        <>
          <Field label="Driver">
            <Select value={driverId} onChange={(e) => setDriverId(e.target.value)}>
              <option value="">— none —</option>
              {datasources.map((ds) => <option key={ds.id} value={ds.id}>{ds.label} [{ds.id}]</option>)}
            </Select>
          </Field>

          {driverId && (
            <Field label={memory ? "Variable name in the datasource" : "Driver address (tag path in datasource)"}
              hint={`binding: ns:${path || "…"}`}>
              <Input mono value={driverAddr} onChange={(e) => setDriverAddr(e.target.value)}
                placeholder={memory ? nsLeaf(path.trim()) || "Counter" : "Arp.Plc.Eclr/MainInstance.iInteger"} />
            </Field>
          )}
        </>
      )}

      {exists && (
        <div className="text-ui-label text-zinc-400">
          {source!.label} already has a variable named {address}; this node will point at it.
        </div>
      )}

      {creates && (
        <fieldset className="rounded border border-zinc-700 p-3 space-y-3">
          <legend className="px-1 text-ui-label font-semibold uppercase tracking-wide text-zinc-400">New memory variable in {source!.label}</legend>
          <Field label="Variable type" hint={TYPE_HELP[varType]}>
            <Select value={varType} onChange={(e) => setVarType(e.target.value as Type)}>
              {MEMORY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Field>
          <Field label="Starting value" hint="Left blank it starts as false, 0 or empty text."
            error={badInitial ? `Not ${TYPE_HELP[varType]}.` : undefined}>
            <Input mono value={initial} onChange={(e) => setInitial(e.target.value)} placeholder={varType === "bool" ? "false" : varType === "string" ? "" : "0"} />
          </Field>
          <Checkbox label="Keep the value when the runtime restarts" checked={retain} onChange={(e) => setRetain(e.target.checked)} />
          <div className="text-ui-label text-zinc-400">Saving adds it to {source!.label}. Deploy the project to make it live.</div>
        </fieldset>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Field label="Unit"><Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. °C" /></Field>
        {creates ? (
          <Field label="Data type" hint="From the variable type.">
            <Input value={NS_DATA_TYPE[varType]} disabled readOnly />
          </Field>
        ) : (
          <Field label="Data type">
            <Select value={dataType} onChange={(e) => setDataType(e.target.value)}>
              <option value="">auto</option>
              <option value="float">float</option>
              <option value="int">int</option>
              <option value="bool">bool</option>
              <option value="string">string</option>
            </Select>
          </Field>
        )}
      </div>

      <Field label="Description">
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" />
      </Field>

      {problem && <div className="text-ui-label text-zinc-400">{problem}</div>}
    </div>
    </Dialog>
  );
}
