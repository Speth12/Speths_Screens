package project

// v4ToV5 turns the theme from one id into the object format 5 has. Every
// format-4 project had the one theme, high-performance, which is the calm
// preset in light mode. A project with no theme keeps none: the runtime and
// the IDE then use the calm preset.
func (u *upgrader) v4ToV5(doc map[string]any) {
	if _, isID := doc["theme"].(string); isID {
		doc["theme"] = map[string]any{"preset": "calm", "mode": "light"}
	}
}
