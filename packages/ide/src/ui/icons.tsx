// The editor's icons. Every icon the IDE draws is named here, so the set stays small and the same
// action looks the same everywhere. They come from lucide-react (ISC license); only the ones
// listed are bundled.
//
// An icon is decoration: it is hidden from screen readers, so a button that shows only an icon
// needs a name of its own (IconButton's label, or aria-label). It sits on the text line like a
// letter and takes the color of the text around it.
import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical,
  AlignHorizontalDistributeCenter, AlignStartHorizontal, AlignStartVertical, AlignVerticalDistributeCenter,
  ArrowDown, ArrowUp, ArrowUpRight, Bell, BellRing, Braces, BringToFront, Group, SendToBack, Ungroup, ChartLine, Check, ChevronDown, ChevronLeft, ChevronRight,
  CircleDot, CirclePlus, CircleX, Clock, Component, Cylinder, Delete, Download, Diamond, FlaskConical, Folder, FolderOpen,
  Gauge, Hash, Heading, History, Image, Layers, List, Lock, LockOpen, Moon, Pencil, Play, Plug, Redo2, RefreshCw, RotateCcw,
  Settings, Shapes, SlidersHorizontal, Spline, Square, Sun, Table, Tag, TextCursorInput, Trash2, TriangleAlert,
  Type, Undo2, Upload, User, X,
  type LucideIcon, type LucideProps,
} from "lucide-react";
import type { WidgetType } from "@speths-screens/shared-types";

export type IconProps = LucideProps;
export type Icon = (props: IconProps) => React.JSX.Element;

/** 16 px, a 1.75 px line: the size beside 13 px text. Pass `size` for a smaller or larger one. */
function ui(Shape: LucideIcon): Icon {
  return function UiIcon({ className = "", ...rest }: IconProps) {
    return <Shape size={16} strokeWidth={1.75} aria-hidden="true" focusable="false" {...rest} className={`inline-block shrink-0 align-[-0.15em] ${className}`} />;
  };
}

// Closing, confirming, results
export const CloseIcon = ui(X);
export const CheckIcon = ui(Check);
export const FailIcon = ui(CircleX);
export const WarningIcon = ui(TriangleAlert);

// Trees and lists
export const ChevronDownIcon = ui(ChevronDown);
export const ChevronRightIcon = ui(ChevronRight);
export const ChevronLeftIcon = ui(ChevronLeft);
export const FolderIcon = ui(Folder);
/** A named variable (a namespace tag). */
export const TagIcon = ui(Tag);
export const ArrowUpIcon = ui(ArrowUp);
export const ArrowDownIcon = ui(ArrowDown);
// The drawing order and grouping of widgets
export const ToFrontIcon = ui(BringToFront);
export const ToBackIcon = ui(SendToBack);
export const GroupIcon = ui(Group);
export const UngroupIcon = ui(Ungroup);
/** Opens in a tab of its own. */
export const OpenTabIcon = ui(ArrowUpRight);

// Editing
export const AddIcon = ui(CirclePlus);
export const EditIcon = ui(Pencil);
export const DeleteIcon = ui(Trash2);
export const UndoIcon = ui(Undo2);
export const RedoIcon = ui(Redo2);
export const RefreshIcon = ui(RefreshCw);
export const ResetIcon = ui(RotateCcw);
export const LockIcon = ui(Lock);
export const UnlockIcon = ui(LockOpen);
export const BackspaceIcon = ui(Delete);

// Project and editor actions
export const SaveIcon = ui(Download);
export const OpenIcon = ui(FolderOpen);
export const UploadIcon = ui(Upload);
export const SettingsIcon = ui(Settings);
export const PreviewIcon = ui(Play);
export const JsonIcon = ui(Braces);
export const LightIcon = ui(Sun);
export const DarkIcon = ui(Moon);
export const ImageIcon = ui(Image);

// Aligning a selection. "Vertical" in lucide's names is the line the widgets align to.
export const AlignLeftIcon = ui(AlignStartVertical);
export const AlignCenterXIcon = ui(AlignCenterVertical);
export const AlignRightIcon = ui(AlignEndVertical);
export const AlignTopIcon = ui(AlignStartHorizontal);
export const AlignCenterYIcon = ui(AlignCenterHorizontal);
export const AlignBottomIcon = ui(AlignEndHorizontal);
export const DistributeXIcon = ui(AlignHorizontalDistributeCenter);
export const DistributeYIcon = ui(AlignVerticalDistributeCenter);

/** An icon for each widget type, for palettes and lists. */
export const WIDGET_ICONS: Record<WidgetType, Icon> = {
  gauge: ui(Gauge),
  trend: ui(ChartLine),
  led: ui(CircleDot),
  button: ui(Square),
  numericInput: ui(TextCursorInput),
  numericDisplay: ui(Hash),
  textInput: ui(TextCursorInput),
  textDisplay: ui(Type),
  historyLog: ui(History),
  tank: ui(Cylinder),
  setpoint: ui(SlidersHorizontal),
  multiState: ui(Layers),
  alarmBanner: ui(Bell),
  image: ui(Image),
  symbol: ui(Shapes),
  customWidget: ui(Component),
  table: ui(Table),
  pipe: ui(Spline),
  pageList: ui(List),
  clock: ui(Clock),
  driverStatus: ui(Plug),
  userMenu: ui(User),
  recipes: ui(FlaskConical),
  shape: ui(Diamond),
  alarmIndicator: ui(BellRing),
  pageTitle: ui(Heading),
};

/** The icon of a widget type. */
export function WidgetIcon({ type, ...rest }: { type: WidgetType } & IconProps) {
  const Shape = WIDGET_ICONS[type];
  return <Shape {...rest} />;
}
