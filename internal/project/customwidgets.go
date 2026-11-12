package project

import (
	"fmt"
	"strings"
)

// customWidgetProblems reports a custom widget placed on a page or inside another custom widget that
// does not exist, and a custom widget that contains itself, directly or through others. The
// TypeScript twin (packages/shared-types/src/customWidgets.ts) says the same, in the same order.
func customWidgetProblems(p *Project) []string {
	var out []string
	byID := map[string]*CustomWidgetElement{}
	for i := range p.CustomWidgets {
		byID[p.CustomWidgets[i].ID] = &p.CustomWidgets[i]
	}
	missing := func(where string, id *string) {
		if id != nil && *id != "" && byID[*id] == nil {
			out = append(out, fmt.Sprintf("%s: no custom widget with id %q", where, *id))
		}
	}
	for _, pg := range p.Pages {
		for _, w := range pg.Widgets {
			if w.Type == CustomWidget && w.Props != nil {
				missing(fmt.Sprintf("page %q, widget %s (%s)", pg.Name, w.ID, w.Type), w.Props.CustomWidgetID)
			}
		}
	}
	for _, cw := range p.CustomWidgets {
		for _, w := range cw.Widgets {
			if w.Type == CustomWidget && w.Props != nil {
				missing(fmt.Sprintf("custom widget %q, widget %s (%s)", cw.Name, w.LocalID, w.Type), w.Props.CustomWidgetID)
			}
		}
	}
	if p.Shell != nil {
		seen := map[string]bool{}
		for _, slot := range p.Shell.Frame {
			if seen[slot.ID] {
				out = append(out, fmt.Sprintf("frame slot %q is listed twice", slot.ID))
			}
			seen[slot.ID] = true
			missing(fmt.Sprintf("frame slot %q", slot.ID), &slot.CustomWidgetID)
		}
		// What the built-in header names has to exist: the page its alarm count opens, and its logo.
		if h := p.Shell.Header; h != nil {
			if h.AlarmsPage != nil && *h.AlarmsPage != "" {
				found := false
				for _, pg := range p.Pages {
					found = found || pg.ID == *h.AlarmsPage
				}
				if !found {
					out = append(out, fmt.Sprintf("header: the alarm count opens page %q, which does not exist", *h.AlarmsPage))
				}
			}
			if h.LogoImage != nil && *h.LogoImage != "" {
				found := false
				for _, img := range p.Images {
					found = found || img.ID == *h.LogoImage
				}
				if !found {
					out = append(out, fmt.Sprintf("header: the logo is image %q, which does not exist", *h.LogoImage))
				}
			}
		}
	}
	// A custom widget that can reach itself: follow the custom widgets its parts name.
	var walk func(cw *CustomWidgetElement, target string, path []string, seen map[string]bool) []string
	walk = func(cw *CustomWidgetElement, target string, path []string, seen map[string]bool) []string {
		for _, w := range cw.Widgets {
			if w.Type != CustomWidget || w.Props == nil || w.Props.CustomWidgetID == nil {
				continue
			}
			next := byID[*w.Props.CustomWidgetID]
			if next == nil {
				continue
			}
			if next.ID == target {
				return append(path, next.Name)
			}
			if seen[next.ID] {
				continue
			}
			seen[next.ID] = true
			if found := walk(next, target, append(path, next.Name), seen); found != nil {
				return found
			}
		}
		return nil
	}
	for i := range p.CustomWidgets {
		cw := &p.CustomWidgets[i]
		if path := walk(cw, cw.ID, []string{cw.Name}, map[string]bool{cw.ID: true}); path != nil {
			out = append(out, fmt.Sprintf("custom widget %q contains itself (%s)", cw.Name, strings.Join(path, " > ")))
		}
	}
	return out
}
