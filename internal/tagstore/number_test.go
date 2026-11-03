package tagstore

import "testing"

func TestNumber(t *testing.T) {
	tests := []struct {
		name string
		v    any
		want float64
		ok   bool
	}{
		{"LREAL float64", 1.5, 1.5, true},
		{"REAL float32", float32(2.5), 2.5, true},
		{"int", 7, 7, true},
		{"SINT int8", int8(-8), -8, true},
		{"INT int16", int16(-300), -300, true},
		{"DINT int32", int32(70000), 70000, true},
		{"LINT int64", int64(1 << 40), 1 << 40, true},
		{"uint", uint(9), 9, true},
		{"BYTE uint8", uint8(255), 255, true},
		{"WORD uint16", uint16(65535), 65535, true},
		{"DWORD uint32", uint32(4294967295), 4294967295, true},
		{"ULINT uint64", uint64(1 << 50), 1 << 50, true},
		{"true", true, 1, true},
		{"false", false, 0, true},
		{"text", "42", 0, false},
		{"nil", nil, 0, false},
	}
	for _, tc := range tests {
		got, ok := Number(tc.v)
		if got != tc.want || ok != tc.ok {
			t.Errorf("%s: Number(%v) = %v, %v; want %v, %v", tc.name, tc.v, got, ok, tc.want, tc.ok)
		}
	}
}
