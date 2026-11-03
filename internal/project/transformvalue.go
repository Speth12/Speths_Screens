package project

import (
	"bytes"
	"encoding/json"
	"fmt"
)

// quicktype generates TransformValue (schema.json: a string, number or
// boolean) as a struct with one field per type, but with --just-types it
// leaves out the JSON methods that fill it in. These are they.

// UnmarshalJSON reads a string, number or boolean.
func (v *TransformValue) UnmarshalJSON(b []byte) error {
	*v = TransformValue{}
	b = bytes.TrimSpace(b)
	switch {
	case len(b) > 0 && b[0] == '"':
		var s string
		if err := json.Unmarshal(b, &s); err != nil {
			return err
		}
		v.String = &s
	case bytes.Equal(b, []byte("true")), bytes.Equal(b, []byte("false")):
		t := b[0] == 't'
		v.Bool = &t
	default:
		var f float64
		if err := json.Unmarshal(b, &f); err != nil {
			return fmt.Errorf("a transform value is a string, number or boolean, not %s", b)
		}
		v.Double = &f
	}
	return nil
}

// MarshalJSON writes whichever of the three is set (null for none).
func (v TransformValue) MarshalJSON() ([]byte, error) {
	switch {
	case v.String != nil:
		return json.Marshal(*v.String)
	case v.Bool != nil:
		return json.Marshal(*v.Bool)
	case v.Double != nil:
		return json.Marshal(*v.Double)
	}
	return []byte("null"), nil
}

// Value returns the value as a string, float64 or bool, or nil.
func (v TransformValue) Value() any {
	switch {
	case v.String != nil:
		return *v.String
	case v.Bool != nil:
		return *v.Bool
	case v.Double != nil:
		return *v.Double
	}
	return nil
}
