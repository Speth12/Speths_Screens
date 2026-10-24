package project

import (
	"bytes"
	"encoding/json"
	"fmt"
)

// decodeProps converts a widget's merged settings into the settings type of
// its widget type (see widgets.go), refusing settings that type lacks.
func decodeProps(have, want WidgetType, props *WidgetProps, out any) error {
	if have != want {
		return fmt.Errorf("widget is a %s, not a %s", have, want)
	}
	if props == nil {
		return nil
	}
	data, err := json.Marshal(props)
	if err != nil {
		return err
	}
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	if err := dec.Decode(out); err != nil {
		return fmt.Errorf("%s settings: %w", want, err)
	}
	return nil
}
