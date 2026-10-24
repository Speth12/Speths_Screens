package project

// WidgetView is what the runtime reads of a widget, the same for a page
// widget and a widget inside a faceplate (whose tags may hold {param}).
type WidgetView struct {
	ID       string // a faceplate widget's localId
	Type     WidgetType
	Props    *WidgetProps
	Bindings *WidgetBindings
	Events   *WidgetEvents
	Dynamics []DynamicElement
}

// View returns what the runtime reads of w.
func (w Widget) View() WidgetView {
	return WidgetView{ID: w.ID, Type: w.Type, Props: w.Props, Bindings: w.Bindings, Events: w.Events, Dynamics: w.Dynamics}
}

// View returns what the runtime reads of w.
func (w FaceplateWidget) View() WidgetView {
	v := WidgetView{ID: w.LocalID, Type: w.Type, Bindings: w.Bindings, Events: w.Events, Dynamics: w.Dynamics}
	if w.Props != nil {
		p := WidgetProps(*w.Props) // same settings, generated twice by quicktype
		v.Props = &p
	}
	return v
}

// inputTypes write their value tag.
var inputTypes = map[WidgetType]bool{NumericInput: true, TextInput: true, Setpoint: true}

// writingActions write a tag: their own, or the widget's value tag.
var writingActions = map[ActionType]bool{Write: true, Toggle: true, Increment: true}

// ValueTag is the widget's value binding, or "".
func (v WidgetView) ValueTag() string {
	if v.Bindings == nil || v.Bindings.Value == nil {
		return ""
	}
	return *v.Bindings.Value
}

// Tags lists every tag the widget reads or writes, in no set order and
// possibly repeated: its bindings, the tags in its settings (trend series,
// table rows, faceplate parameters), its dynamics and its actions.
func (v WidgetView) Tags() []string {
	var out []string
	add := func(s *string) {
		if s != nil && *s != "" {
			out = append(out, *s)
		}
	}
	if b := v.Bindings; b != nil {
		add(b.Value)
		add(b.Visible)
		add(b.Color)
	}
	if p := v.Props; p != nil {
		for _, s := range p.Tags {
			out = append(out, s.Binding)
		}
		for _, r := range p.Rows {
			out = append(out, r.Binding)
		}
		for _, b := range p.Params { // faceplate instance: param → binding
			out = append(out, b)
		}
	}
	for _, d := range v.Dynamics {
		add(d.Binding)
	}
	return append(out, v.WriteTargets()...)
}

// WriteTargets lists the tags the widget writes: an input's value tag and
// the tags its actions write.
func (v WidgetView) WriteTargets() []string {
	var out []string
	if inputTypes[v.Type] && v.ValueTag() != "" {
		out = append(out, v.ValueTag())
	}
	if e := v.Events; e != nil {
		for _, list := range [][]Action{e.OnClick, e.OnPress, e.OnRelease} {
			for _, a := range list {
				if !writingActions[a.Type] {
					continue
				}
				if a.Tag != nil && *a.Tag != "" {
					out = append(out, *a.Tag)
				} else if v.ValueTag() != "" {
					out = append(out, v.ValueTag())
				}
			}
		}
	}
	return out
}

// Limits returns the min and max a writing widget allows, if set.
func (v WidgetView) Limits() (min, max *float64) {
	if v.Props == nil {
		return nil, nil
	}
	return v.Props.Min, v.Props.Max
}
