package main

import (
	"runtime"
	"slices"
	"strings"
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

func TestVersionString(t *testing.T) {
	defer func(v, c string) { version, commit = v, c }(version, commit)
	tests := []struct{ version, commit, want string }{
		{"v0.8.0", "abc1234", "speths-screens v0.8.0 (abc1234) " + runtime.GOOS + "/" + runtime.GOARCH},
		{"dev", "abc1234", "speths-screens dev (abc1234) " + runtime.GOOS + "/" + runtime.GOARCH},
	}
	for _, tc := range tests {
		version, commit = tc.version, tc.commit
		if got := versionString(); got != tc.want {
			t.Errorf("versionString() = %q, want %q", got, tc.want)
		}
	}
	version, commit = "v1.0.0", ""
	if got := versionString(); !strings.HasPrefix(got, "speths-screens v1.0.0") || !strings.HasSuffix(got, runtime.GOOS+"/"+runtime.GOARCH) {
		t.Errorf("versionString() without a commit = %q", got)
	}
}
