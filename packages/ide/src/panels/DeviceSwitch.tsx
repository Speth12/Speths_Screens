// Which screen size the editor is working on. The desktop's positions are the widgets' own; on a
// tablet or phone, moving or resizing a widget stores that size's layout and leaves the rest alone.
import { DEVICE_WIDTH, type Device } from "@speths-screens/widgets";
import { useEditorView } from "../store/editorView";

const DEVICES: { id: Device; label: string }[] = [
  { id: "desktop", label: "Desktop" },
  { id: "tablet", label: "Tablet" },
  { id: "phone", label: "Phone" },
];

/** Live values from the runtime, or made-up ones for designing with no PLC. */
export function DataSwitch() {
  const data = useEditorView((s) => s.data);
  const setData = useEditorView((s) => s.setData);
  return (
    <label className="flex items-center gap-1 text-[11px] text-zinc-400 shrink-0" title="Where the canvas and preview get their values. Demo values are made up and nothing is written to the PLC.">
      Data
      <select aria-label="Data" value={data} onChange={(e) => setData(e.target.value as "live" | "dummy")}
        className={`text-[11px] border rounded px-1 py-0.5 ${data === "dummy" ? "bg-amber-900/50 border-amber-700 text-amber-200" : "bg-zinc-800 border-zinc-700 text-zinc-200"}`}>
        <option value="live">Live (PLC)</option>
        <option value="dummy">Demo values</option>
      </select>
    </label>
  );
}

export function DeviceSwitch() {
  const device = useEditorView((s) => s.device);
  const setDevice = useEditorView((s) => s.setDevice);
  return (
    <div role="group" aria-label="Screen size" className="flex rounded overflow-hidden border border-zinc-700 shrink-0">
      {DEVICES.map((d) => (
        <button key={d.id} aria-pressed={device === d.id} onClick={() => setDevice(d.id)}
          title={`Edit the layout for a ${d.id} (${DEVICE_WIDTH[d.id]} px wide)`}
          className={`text-xs px-2 py-1 ${device === d.id ? "bg-blue-700 text-white" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}>
          {d.label}
        </button>
      ))}
    </div>
  );
}
