package project

// v5ToV6 renames faceplates to custom widgets: the project's "faceplates" list becomes
// "customWidgets", a widget of type "faceplate" becomes "customWidget" and its "faceplateId"
// setting becomes "customWidgetId". The new layout settings are optional, so a converted
// custom widget keeps its free layout.
func (u *upgrader) v5ToV6(doc map[string]any) {
	if list, ok := doc["faceplates"]; ok {
		doc["customWidgets"] = list
		delete(doc, "faceplates")
	}
	rename := func(list any) {
		items, _ := list.([]any)
		for _, it := range items {
			w, _ := it.(map[string]any)
			if w["type"] != "faceplate" {
				continue
			}
			w["type"] = "customWidget"
			if props, ok := w["props"].(map[string]any); ok {
				if id, ok := props["faceplateId"]; ok {
					props["customWidgetId"] = id
					delete(props, "faceplateId")
				}
			}
		}
	}
	for _, owner := range []string{"pages", "presets", "customWidgets"} {
		items, _ := doc[owner].([]any)
		for _, it := range items {
			if o, ok := it.(map[string]any); ok {
				rename(o["widgets"])
			}
		}
	}
}
