package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"
)

func operatorFS() fstest.MapFS {
	return fstest.MapFS{
		"index.html":   {Data: []byte("OPERATOR")},
		"assets/op.js": {Data: []byte("op-js")},
	}
}

func ideTestFS() fstest.MapFS {
	return fstest.MapFS{
		"index.html":    {Data: []byte("IDE")},
		"assets/ide.js": {Data: []byte("ide-js")},
	}
}

func TestUIHandler(t *testing.T) {
	op := spaFS(operatorFS())
	tests := []struct {
		name     string
		withIDE  bool
		path     string
		wantCode int
		wantBody string
		wantLoc  string
	}{
		{"operator at the root", true, "/", 200, "OPERATOR", ""},
		{"operator file", true, "/assets/op.js", 200, "op-js", ""},
		{"operator route falls back to its index", true, "/some/page", 200, "OPERATOR", ""},
		{"ide index", true, "/ide/", 200, "IDE", ""},
		{"ide file", true, "/ide/assets/ide.js", 200, "ide-js", ""},
		{"ide route falls back to the ide index", true, "/ide/whatever", 200, "IDE", ""},
		{"ide without the slash redirects", true, "/ide", 301, "", "/ide/"},
		{"a file of the operator is not under /ide", true, "/ide/assets/op.js", 200, "IDE", ""},
		{"a name that only starts with ide is the operator's", true, "/idea", 200, "OPERATOR", ""},
		{"a directory is not listed", true, "/assets", 200, "OPERATOR", ""},
		{"a directory with a slash is not listed", true, "/ide/assets/", 200, "IDE", ""},
		{"no ide built in: /ide/ is the operator's fallback", false, "/ide/", 200, "OPERATOR", ""},
		{"no ide built in: the operator still works", false, "/", 200, "OPERATOR", ""},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			var h http.Handler
			if tc.withIDE {
				h = uiHandler(op, ideTestFS())
			} else {
				h = uiHandler(op, nil)
			}
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, httptest.NewRequest("GET", tc.path, nil))
			body, _ := io.ReadAll(rec.Result().Body)
			if rec.Code != tc.wantCode {
				t.Errorf("status %d, want %d", rec.Code, tc.wantCode)
			}
			if tc.wantBody != "" && string(body) != tc.wantBody {
				t.Errorf("body %q, want %q", body, tc.wantBody)
			}
			if got := rec.Header().Get("Location"); got != tc.wantLoc {
				t.Errorf("Location %q, want %q", got, tc.wantLoc)
			}
		})
	}
}

func TestSPAIndexIsNotCached(t *testing.T) {
	rec := httptest.NewRecorder()
	spaFS(operatorFS()).ServeHTTP(rec, httptest.NewRequest("GET", "/", nil))
	if got := rec.Header().Get("Cache-Control"); got != "no-cache" {
		t.Errorf("Cache-Control %q, want no-cache", got)
	}
}
