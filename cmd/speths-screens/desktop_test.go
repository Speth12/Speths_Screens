package main

import (
	"net"
	"net/http"
	"path/filepath"
	"strconv"
	"testing"
)

func TestIsDesktopStart(t *testing.T) {
	tests := []struct {
		name     string
		args     []string
		explicit bool
		hasIDE   bool
		want     bool
	}{
		{"double-click with the IDE", nil, false, true, true},
		{"double-click without the IDE (the panel program)", nil, false, false, false},
		{"any argument keeps the old behavior", []string{"--mode=runtime"}, false, true, false},
		{"--desktop with other arguments", []string{"--desktop", "--no-browser"}, true, true, true},
		{"--desktop without the IDE", []string{"--desktop"}, true, false, false},
	}
	for _, tc := range tests {
		if got := isDesktopStart(tc.args, tc.explicit, tc.hasIDE); got != tc.want {
			t.Errorf("%s: got %v, want %v", tc.name, got, tc.want)
		}
	}
}

func TestInDataDir(t *testing.T) {
	dir := filepath.Join("data", "folder")
	abs, _ := filepath.Abs("elsewhere.db")
	tests := []struct{ dir, name, want string }{
		{dir, "history.db", filepath.Join(dir, "history.db")},
		{dir, "", ""},
		{dir, ":memory:", ":memory:"},
		{dir, abs, abs},
		{"", "history.db", "history.db"},
	}
	for _, tc := range tests {
		if got := inDataDir(tc.dir, tc.name); got != tc.want {
			t.Errorf("inDataDir(%q, %q) = %q, want %q", tc.dir, tc.name, got, tc.want)
		}
	}
}

func TestDefaultDataDir(t *testing.T) {
	t.Setenv("LOCALAPPDATA", filepath.Join("base", "local"))
	t.Setenv("XDG_DATA_HOME", filepath.Join("base", "xdg"))
	got, err := defaultDataDir()
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Base(got) != "Speths Screens" {
		t.Errorf("data folder %q does not end in the product folder", got)
	}
}

func TestPickDesktopAddrIsLoopbackAndFree(t *testing.T) {
	addr, err := pickDesktopAddr()
	if err != nil {
		t.Skipf("no free desktop port here: %v", err)
	}
	host, port, err := net.SplitHostPort(addr)
	if err != nil || host != "127.0.0.1" {
		t.Fatalf("addr %q is not a loopback address", addr)
	}
	if p, _ := strconv.Atoi(port); p < desktopFirstPort || p >= desktopFirstPort+desktopPortCount {
		t.Errorf("port %d is outside the desktop range", p)
	}
	l, err := net.Listen("tcp", addr)
	if err != nil {
		t.Fatalf("the picked address is not free: %v", err)
	}
	l.Close()
}

func TestRunningInstanceFindsOurProgramOnly(t *testing.T) {
	addr, err := pickDesktopAddr()
	if err != nil {
		t.Skipf("no free desktop port here: %v", err)
	}
	serve := func(body string) (stop func()) {
		l, err := net.Listen("tcp", addr)
		if err != nil {
			t.Skipf("port taken meanwhile: %v", err)
		}
		srv := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte(body))
		})}
		go srv.Serve(l)
		return func() { srv.Close() }
	}

	stop := serve(`<html>not ours</html>`)
	if got, ok := runningInstance(); ok && got == addr {
		t.Errorf("a web server that is not ours was taken for the program at %s", addr)
	}
	stop()

	stop = serve(`{"ok":true,"version":"dev","schemaVersion":7}`)
	defer stop()
	// Another program of ours on a lower port may answer first; any answer proves the check works.
	if got, ok := runningInstance(); !ok {
		t.Errorf("runningInstance() = %q, false; want the program at %s", got, addr)
	}
}
