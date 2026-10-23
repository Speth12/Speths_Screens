// speths-screens is the runtime binary for both dev and PLC modes.
//
//	speths-screens --mode=dev       # serve the IDE bundle on :3001
//	speths-screens --mode=runtime   # serve the operator bundle on :8080
package main

import (
	"context"
	"crypto/rand"
	"embed"
	"encoding/json"
	"flag"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/Speth12/speths-screens/internal/alarmstore"
	"github.com/Speth12/speths-screens/internal/api"
	"github.com/Speth12/speths-screens/internal/assets"
	"github.com/Speth12/speths-screens/internal/audit"
	"github.com/Speth12/speths-screens/internal/faceplate"
	"github.com/Speth12/speths-screens/internal/historian"
	_ "github.com/Speth12/speths-screens/internal/historian/providers/memory"
	_ "github.com/Speth12/speths-screens/internal/historian/providers/sqlite"
	"github.com/Speth12/speths-screens/internal/project"
	"github.com/Speth12/speths-screens/internal/recipestore"
	"github.com/Speth12/speths-screens/internal/runtime"
	"github.com/Speth12/speths-screens/internal/security"
	"github.com/Speth12/speths-screens/internal/tagstore"
	"github.com/Speth12/speths-screens/internal/versionstore"
)

//go:embed ui
var uiFiles embed.FS

// spaHandler serves the embedded operator UI and falls back to index.html
// for any path that isn't a real asset (SPA client-side routing).
func spaHandler() http.Handler {
	sub, err := fs.Sub(uiFiles, "ui")
	if err != nil {
		log.Fatalf("[Speth's Screens] embed sub: %v", err)
	}
	fileServer := http.FileServer(http.FS(sub))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Try to open the exact file. If missing, serve index.html.
		f, err := sub.Open(r.URL.Path[1:]) // strip leading /
		if err == nil {
			f.Close()
			fileServer.ServeHTTP(w, r)
			return
		}
		// fall back to SPA index
		data, _ := fs.ReadFile(sub, "index.html")
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write(data)
	})
}

func main() {
	healthcheck := flag.Bool("healthcheck", false, "probe own /api/v1/alive and exit 0/1")
	mode := flag.String("mode", "dev", "dev | runtime")
	addr := flag.String("addr", "", "listen address (default :3001 dev / :8080 runtime)")
	projectPath := flag.String("project", "", "path to project.json (optional in dev)")
	historyDB := flag.String("history", "history.db", "SQLite WAL file (use ':memory:' to disable persistence)")
	historyRetention := flag.Duration("history-retention", 7*24*time.Hour, "how long to keep history (e.g. 48h, 7d)")
	alarmDB    := flag.String("alarm-db",    "alarms.db",    "SQLite file for alarm event history")
	versionDB  := flag.String("version-db",  "versions.db",  "SQLite file for project version history")
	securityDB := flag.String("security-db", "security.db",  "SQLite file for users and sessions")
	auditDB    := flag.String("audit-db",    "",             "SQLite file for audit log (empty = disabled)")
	recipeDB   := flag.String("recipe-db",   "recipes.db",   "SQLite file for recipe history and approvals")
	jwtSecret  := flag.String("jwt-secret",  "",             "JWT signing secret (random 32+ bytes); auto-generated if empty")
	flag.Parse()

	if *healthcheck {
		listenAddr := *addr
		if listenAddr == "" {
			listenAddr = ":8080"
		}
		host := listenAddr
		if host[0] == ':' {
			host = "localhost" + host
		}
		c := &http.Client{Timeout: 3 * time.Second}
		resp, err := c.Get("http://" + host + "/api/v1/alive")
		if err != nil || resp.StatusCode != http.StatusOK {
			os.Exit(1)
		}
		var body struct {
			OK bool `json:"ok"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&body)
		resp.Body.Close()
		if !body.OK {
			os.Exit(1)
		}
		os.Exit(0)
	}

	log.SetFlags(log.Ltime | log.Lmicroseconds | log.Lshortfile)

	if *addr == "" {
		switch *mode {
		case "runtime":
			*addr = ":8080"
		default:
			*addr = ":3001"
		}
	}

	log.Printf("[Speth's Screens] starting mode=%s addr=%s", *mode, *addr)

	store := tagstore.New()
	hist, err := historian.Open(*historyDB)
	if err != nil {
		log.Fatalf("[Speth's Screens] historian: %v", err)
	}
	hist.SetRetention(*historyRetention)
	defer hist.Close()

	alarmSt, err := alarmstore.Open(*alarmDB)
	if err != nil {
		log.Fatalf("[Speth's Screens] alarmstore: %v", err)
	}
	defer alarmSt.Close()

	versionSt, err := versionstore.Open(*versionDB)
	if err != nil {
		log.Fatalf("[Speth's Screens] versionstore: %v", err)
	}
	defer versionSt.Close()

	rt := runtime.New(store, hist)
	rt.AlarmStore = alarmSt

	// Security — always on; auto-seeds admin/admin on first run.
	{
		secret := []byte(*jwtSecret)
		if len(secret) == 0 {
			secret = generateSecret()
		}
		secSt, err := security.Open(*securityDB, secret)
		if err != nil {
			log.Fatalf("[Speth's Screens] security: %v", err)
		}
		defer secSt.Close()
		rt.Security = secSt
		// First-run: seed a default admin so the operator login works immediately.
		users, _ := secSt.ListUsers(context.Background())
		if len(users) == 0 {
			_, err := secSt.CreateUser(context.Background(), "admin", "admin", security.RoleAdmin)
			if err != nil {
				log.Printf("[Speth's Screens] security: could not seed admin: %v", err)
			} else {
				log.Printf("[Speth's Screens] *** FIRST RUN: created admin user — username: admin  password: admin ***")
			}
		}
		log.Printf("[Speth's Screens] security DB: %s (%d users)", *securityDB, len(users))
	}

	// Audit log (optional).
	if *auditDB != "" {
		auditSt, err := audit.Open(*auditDB)
		if err != nil {
			log.Fatalf("[Speth's Screens] audit: %v", err)
		}
		defer auditSt.Close()
		rt.Audit = auditSt
		log.Printf("[Speth's Screens] audit DB: %s", *auditDB)
	}

	// Recipe history + approvals (optional).
	if *recipeDB != "" {
		recipeSt, err := recipestore.Open(*recipeDB)
		if err != nil {
			log.Fatalf("[Speth's Screens] recipestore: %v", err)
		}
		defer recipeSt.Close()
		rt.Recipes = recipeSt
		log.Printf("[Speth's Screens] recipe DB: %s", *recipeDB)
	}

	// Asset model + faceplate registry (always active).
	assetRegistry := assets.New()
	rt.Assets = assetRegistry
	rt.Faceplates = faceplate.New(assetRegistry)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	rt.Start(ctx)
	defer rt.Stop()

	if *projectPath != "" {
		p, err := project.Load(*projectPath)
		if err != nil {
			log.Fatalf("[Speth's Screens] load project: %v", err)
		}
		if err := rt.LoadProject(ctx, p); err != nil {
			log.Fatalf("[Speth's Screens] load project: %v", err)
		}
		log.Printf("[Speth's Screens] loaded %s — %d datasources, %d pages", *projectPath, len(p.Datasources), len(p.Pages))
	}

	// Serve operator UI for runtime mode; nil assets (IDE proxies its own) for dev.
	var assets http.Handler
	if *mode == "runtime" {
		assets = spaHandler()
	}
	srv := api.New(rt, assets, versionSt)
	srv.DevMode = *mode == "dev"

	httpSrv := &http.Server{
		Addr:              *addr,
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		log.Printf("[Speth's Screens] HTTP serving on %s", *addr)
		if err := httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[Speth's Screens] HTTP: %v", err)
		}
	}()

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, os.Interrupt, syscall.SIGTERM)
	<-sig
	log.Println("[Speth's Screens] shutting down...")

	shutCtx, shutCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutCancel()
	_ = httpSrv.Shutdown(shutCtx)
}

func generateSecret() []byte {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		log.Fatalf("[Speth's Screens] crypto/rand: %v", err)
	}
	log.Println("[Speth's Screens] WARNING: JWT secret auto-generated; tokens will be invalidated on restart. Pass --jwt-secret for persistence.")
	return b
}
