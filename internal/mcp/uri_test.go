package mcp

import "testing"

func TestCanonicalURI(t *testing.T) {
	tests := []struct{ name, in, want string }{
		{"current scheme is left alone", "speths-screens://project", "speths-screens://project"},
		{"a legacy URI becomes current", "xhmi://project", "speths-screens://project"},
		{"a legacy page URI keeps its id", "xhmi://page/p-overview", "speths-screens://page/p-overview"},
		{"another scheme is left alone", "file:///etc/passwd", "file:///etc/passwd"},
		{"the old name elsewhere in the text is left alone", "speths-screens://page/xhmi://x", "speths-screens://page/xhmi://x"},
		{"empty", "", ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := canonicalURI(tt.in); got != tt.want {
				t.Errorf("canonicalURI(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}
