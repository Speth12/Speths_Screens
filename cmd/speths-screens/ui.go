package main

import (
	"io/fs"
	"net/http"
	"strings"
)

// spaFS serves the files of fsys and falls back to index.html for any path that is not a file, so client-side
// routes work after a reload. A directory is never listed.
func spaFS(fsys fs.FS) http.Handler {
	fileServer := http.FileServer(http.FS(fsys))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		name := strings.TrimPrefix(r.URL.Path, "/")
		if name != "" && !strings.HasSuffix(name, "/") {
			if info, err := fs.Stat(fsys, name); err == nil && !info.IsDir() {
				fileServer.ServeHTTP(w, r)
				return
			}
		}
		data, err := fs.ReadFile(fsys, "index.html")
		if err != nil {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache") // the page names hashed files; a new build must be seen at once
		_, _ = w.Write(data)
	})
}

// uiHandler serves the operator screen at "/" and, when the program was built with the IDE (ide is not nil), the
// IDE at "/ide/". The IDE is static files: everything it does goes through the runtime's API, which has its own
// login and role checks, so serving the page opens nothing.
func uiHandler(operator http.Handler, ide fs.FS) http.Handler {
	if ide == nil {
		return operator
	}
	ideHandler := http.StripPrefix("/ide", spaFS(ide))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/ide":
			http.Redirect(w, r, "/ide/", http.StatusMovedPermanently)
		case strings.HasPrefix(r.URL.Path, "/ide/"):
			ideHandler.ServeHTTP(w, r)
		default:
			operator.ServeHTTP(w, r)
		}
	})
}
