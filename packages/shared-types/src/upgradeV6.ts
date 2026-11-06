// Format 5 to 6 (internal/project/upgrade_v6.go does the same).
type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** Renames faceplates to custom widgets: the project's `faceplates` list becomes `customWidgets`,
 *  a widget of type `faceplate` becomes `customWidget` and its `faceplateId` setting becomes
 *  `customWidgetId`. The new layout settings are optional, so a converted custom widget keeps its
 *  free layout. */
export function v5ToV6(doc: Obj): void {
  if ("faceplates" in doc) {
    doc.customWidgets = doc.faceplates;
    delete doc.faceplates;
  }
  for (const owner of ["pages", "presets", "customWidgets"]) {
    const items = Array.isArray(doc[owner]) ? (doc[owner] as unknown[]) : [];
    for (const it of items) {
      if (!isObj(it) || !Array.isArray(it.widgets)) continue;
      for (const w of it.widgets) {
        if (!isObj(w) || w.type !== "faceplate") continue;
        w.type = "customWidget";
        if (isObj(w.props) && "faceplateId" in w.props) {
          w.props.customWidgetId = w.props.faceplateId;
          delete w.props.faceplateId;
        }
      }
    }
  }
}
