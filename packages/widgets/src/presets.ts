// Built-in widget presets, offered beside the project's own presets in the
// IDE palette. Sizes and positions are in grid cells; no tags are bound, so
// a preset drops in ready to bind (its buttons write their own value tag).
import type { Preset } from "@speths-screens/shared-types";

const press = { onPress: [{ type: "write" as const, value: 1 }], onRelease: [{ type: "write" as const, value: 0 }] };

export const BUILTIN_PRESETS: Preset[] = [
  {
    id: "builtin-start-stop",
    name: "Start/Stop pair",
    description: "Two momentary buttons: bind Start and Stop to their PLC commands",
    widgets: [
      { id: "start", type: "button", x: 0, y: 0, w: 2, h: 1, props: { label: "Start", btnColor: "green" }, events: press },
      { id: "stop", type: "button", x: 2, y: 0, w: 2, h: 1, props: { label: "Stop", btnColor: "red" }, events: press },
    ],
  },
  {
    id: "builtin-jog",
    name: "Jog button",
    description: "Writes 1 while held and 0 on release",
    widgets: [
      { id: "jog", type: "button", x: 0, y: 0, w: 2, h: 1, props: { label: "Jog", btnColor: "amber" }, events: press },
    ],
  },
  {
    id: "builtin-tank-level",
    name: "Tank with level",
    description: "Tank with high and low colours, and its level as a number",
    widgets: [
      {
        id: "tank", type: "tank", x: 0, y: 0, w: 2, h: 4,
        props: {
          label: "Tank", min: 0, max: 100, unit: "%",
          thresholds: [{ value: 0, toValue: 10, color: "#f59e0b" }, { value: 10, toValue: 90, color: "#3b82f6" }, { value: 90, color: "#ef4444" }],
        },
      },
      { id: "level", type: "numericDisplay", x: 0, y: 4, w: 2, h: 1, props: { label: "Level", unit: "%" } },
    ],
  },
  {
    id: "builtin-alarm-led",
    name: "Alarm light",
    description: "Red when the alarm bit is on, with a text beside it",
    widgets: [
      { id: "led", type: "led", x: 0, y: 0, w: 1, h: 1, props: { trueColor: "#ef4444", falseColor: "#3f3f46" } },
      { id: "text", type: "textDisplay", x: 1, y: 0, w: 3, h: 1, props: { staticText: "Alarm" } },
    ],
  },
  {
    id: "builtin-setpoint-actual",
    name: "Setpoint and actual",
    description: "Enter a setpoint, see the measured value beside it",
    widgets: [
      { id: "sp", type: "numericInput", x: 0, y: 0, w: 2, h: 1, props: { label: "Setpoint", min: 0, max: 100 } },
      { id: "pv", type: "numericDisplay", x: 2, y: 0, w: 2, h: 1, props: { label: "Actual" } },
    ],
  },
];
