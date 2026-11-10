// Which screen size the editor is working on. The desktop's positions are the widgets' own; on a
// tablet or phone, moving or resizing a widget stores that size's layout and leaves the rest alone.
import { DEVICE_WIDTH, type Device } from "@speths-screens/widgets";
import { useEditorView } from "../store/editorView";
import { Segmented, Select } from "../ui";

export const DEVICES: { id: Device; label: string }[] = [
  { id: "desktop", label: "Desktop" },
  { id: "tablet", label: "Tablet" },
  { id: "phone", label: "Phone" },
];

/** Live values from the runtime, or made-up ones for designing with no PLC. */
export function DataSwitch() {
  const data = useEditorView((s) => s.data);
  const setData = useEditorView((s) => s.setData);
  return (
    <label className="flex items-center gap-2 text-ui text-zinc-300 shrink-0" title="Where the canvas and preview get their values. Demo values are made up and nothing is written to the PLC.">
      Data
      <Select aria-label="Data" className={`w-36 ${data === "dummy" ? "!bg-amber-100 !border-amber-600 !text-zinc-900" : ""}`} value={data} onChange={(e) => setData(e.target.value as "live" | "dummy")}>
        <option value="live">Live (PLC)</option>
        <option value="dummy">Demo values</option>
      </Select>
    </label>
  );
}

export function DeviceSwitch() {
  const device = useEditorView((s) => s.device);
  const setDevice = useEditorView((s) => s.setDevice);
  return (
    <Segmented label="Screen size" value={device} onChange={setDevice}
      options={DEVICES.map((d) => ({ id: d.id, label: d.label, title: `Edit the layout for a ${d.id} (${DEVICE_WIDTH[d.id]} px wide)` }))} />
  );
}
