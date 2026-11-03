package drivers

import (
	"slices"
	"testing"
)

func TestNormalizePaths(t *testing.T) {
	tests := []struct {
		name string
		in   []string
		want []string
	}{
		{"nil", nil, []string{}},
		{"sorted already", []string{"a", "b"}, []string{"a", "b"}},
		{"unsorted", []string{"b", "a", "c"}, []string{"a", "b", "c"}},
		{"duplicates", []string{"a", "b", "a", "b"}, []string{"a", "b"}},
		{"empty strings dropped", []string{"", "a", ""}, []string{"a"}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			in := slices.Clone(tc.in)
			got := NormalizePaths(tc.in)
			if !slices.Equal(got, tc.want) {
				t.Errorf("got %v want %v", got, tc.want)
			}
			if !slices.Equal(tc.in, in) {
				t.Errorf("input was modified: %v", tc.in)
			}
		})
	}
}
