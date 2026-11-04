package project

import "testing"

func TestWriteListAllows(t *testing.T) {
	tests := []struct {
		name   string
		writes []string
		forms  []string
		want   bool
	}{
		{"no list writes nothing", nil, []string{"mem:Count"}, false},
		{"an empty list writes nothing", []string{}, []string{"mem:Count"}, false},
		{"an exact entry", []string{"mem:Count"}, []string{"mem:Count"}, true},
		{"an exact entry does not cover a longer path", []string{"mem:Count"}, []string{"mem:Count2"}, false},
		{"an exact entry does not cover another datasource", []string{"mem:Count"}, []string{"plc:Count"}, false},
		{"a prefix covers a whole datasource", []string{"mem:*"}, []string{"mem:Anything/Deep"}, true},
		{"a prefix does not cover another datasource", []string{"mem:*"}, []string{"plc:Count"}, false},
		{"a prefix covers its subtree", []string{"ns:Line1/*"}, []string{"ns:Line1/Temp"}, true},
		{"a prefix stops at its boundary", []string{"ns:Line1/*"}, []string{"ns:Line2/Temp"}, false},
		{"a prefix without a separator is a plain prefix", []string{"plc:Pump*"}, []string{"plc:Pump2/Run"}, true},
		{"a prefix covers the bare prefix itself", []string{"ns:Line1/*"}, []string{"ns:Line1/"}, true},
		{"a prefix does not cover a shorter path", []string{"ns:Line1/*"}, []string{"ns:Line1"}, false},
		{"either form of the tag counts: the one written", []string{"ns:Line1/Temp"}, []string{"ns:Line1/Temp", "plc:Temp"}, true},
		{"either form of the tag counts: the one it resolves to", []string{"plc:Temp"}, []string{"ns:Line1/Temp", "plc:Temp"}, true},
		{"a prefix on the resolved form", []string{"plc:*"}, []string{"ns:Line1/Temp", "plc:Temp"}, true},
		{"no form matches", []string{"mem:*", "plc:Other"}, []string{"ns:Line1/Temp", "plc:Temp"}, false},
		{"any entry will do", []string{"plc:Other", "mem:*", "plc:Temp"}, []string{"plc:Temp"}, true},
		{"a bare star would cover everything (validation refuses it, so it never reaches a running project)", []string{"*"}, []string{"plc:Temp"}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := WriteListAllows(tt.writes, tt.forms...); got != tt.want {
				t.Errorf("WriteListAllows(%q, %q) = %v, want %v", tt.writes, tt.forms, got, tt.want)
			}
		})
	}
}
