package main

import (
	"slices"
	"testing"
)

func TestCheckDevAddr(t *testing.T) {
	tests := []struct {
		addr string
		ok   bool
	}{
		{"127.0.0.1:3001", true},
		{"localhost:3001", true},
		{"[::1]:3001", true},
		{":3001", false},        // all interfaces
		{"0.0.0.0:3001", false}, // all interfaces
		{"10.0.0.5:3001", false},
		{"plc.local:3001", false},
		{"3001", false},
	}
	for _, tc := range tests {
		if err := checkDevAddr(tc.addr); (err == nil) != tc.ok {
			t.Errorf("checkDevAddr(%q) = %v, want ok=%v", tc.addr, err, tc.ok)
		}
	}
}

func TestSplitList(t *testing.T) {
	tests := []struct {
		in   string
		want []string
	}{
		{"", nil},
		{"https://hmi.plant", []string{"https://hmi.plant"}},
		{" https://a , ,https://b ", []string{"https://a", "https://b"}},
	}
	for _, tc := range tests {
		if got := splitList(tc.in); !slices.Equal(got, tc.want) {
			t.Errorf("splitList(%q) = %v, want %v", tc.in, got, tc.want)
		}
	}
}
