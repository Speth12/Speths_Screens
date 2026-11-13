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
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/Speth12/Speths_Screens/internal/alarmstore"
	"github.com/Speth12/Speths_Screens/internal/api"
	"github.com/Speth12/Speths_Screens/internal/assets"
	"github.com/Speth12/Speths_Screens/internal/audit"
	"github.com/Speth12/Speths_Screens/internal/faceplate"
	"github.com/Speth12/Speths_Screens/internal/historian"
	_ "github.com/Speth12/Speths_Screens/internal/historian/providers/memory"
	_ "github.com/Speth12/Speths_Screens/internal/historian/providers/sqlite"
	"github.com/Speth12/Speths_Screens/internal/memstore"
	"github.com/Speth12/Speths_Screens/internal/project"
	"github.com/Speth12/Speths_Screens/internal/recipestore"
	"github.com/Speth12/Speths_Screens/internal/runtime"
	"github.com/Speth12/Speths_Screens/internal/security"
	"github.com/Speth12/Speths_Screens/internal/tagstore"
	"github.com/Speth12/Speths_Screens/internal/targets"
	"github.com/Speth12/Speths_Screens/internal/versionstore"
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
	return spaFS(sub)
}

func main() {
	if len(os.Args) > 1 && os.Args[1] == "upgrade" {
		os.Exit(runUpgrade(os.Args[2:], os.Stdout, os.Stderr))
	}
	healthcheck := flag.Bool("healthcheck", false, "probe own /api/v1/alive and exit 0/1")
	showVersion := flag.Bool("version", false, "print the version and exit")
	mode := flag.String("mode", "dev", "dev | runtime")
	targetsFile := flag.String("targets-file", "targets.json", "where the IDE's deploy targets are saved (only the program that serves the IDE uses it)")
	noIDE := flag.Bool("no-ide", false, "runtime mode: do not serve the IDE at /ide/ (only in programs built with it)")
	addr := flag.String("addr", "", "listen address (default 127.0.0.1:3001 dev, which accepts loopback only / :8080 runtime)")
	projectPath := flag.String("project", "", "path to project.json (optional in dev)")
	historyDB := flag.String("history", "history.db", "SQLite WAL file (use ':memory:' to disable persistence)")
	historyRetention := flag.Duration("history-retention", 7*24*time.Hour, "how long to keep history (e.g. 48h, 7d)")
	alarmDB := flag.String("alarm-db", "alarms.db", "SQLite file for alarm event history")
	versionDB := flag.String("version-db", "versions.db", "SQLite file for project version history")
	securityDB := flag.String("security-db", "security.db", "SQLite file for users and sessions")
	auditDB := flag.String("audit-db", "", "SQLite file for audit log (empty = disabled)")
	recipeDB := flag.String("recipe-db", "recipes.db", "SQLite file for recipe history and approvals")
	memoryDB := flag.String("memory-db", "memory.db", "SQLite file for retained memory-tag values")
	corsOrigins := flag.String("cors-origins", "", "comma-separated extra web origins (scheme://host:port) allowed to call the API")
	jwtSecret := flag.String("jwt-secret", "", "JWT signing secret (random 32+ bytes); auto-generated if empty")
	desktopFlag := flag.Bool("desktop", false, "run for this computer only: keep files in the data folder, pick a free port and open the IDE (the default when a program with the IDE is started with no arguments)")
	dataDir := flag.String("data-dir", "", "folder for the databases and settings; relative file flags are placed inside it (desktop mode defaults to a per-user folder)")
	noBrowser := flag.Bool("no-browser", false, "desktop mode: do not open the browser")
	allowSimulation := flag.Bool("allow-simulation", false, "for demonstrations: run a project whose simulation setting is on, with made-up values in place of its PLC datasources (on by default in desktop mode; never use it in production)")
	flag.Parse()

	desktop := isDesktopStart(os.Args[1:], *desktopFlag, ideFS() != nil)

	if *showVersion {
		fmt.Println(versionString())
		return
	}

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
	log.Printf("[Speth's Screens] %s", versionString())

	if desktop {
		*mode = "runtime"
		if *dataDir == "" {
			d, err := defaultDataDir()
			if err != nil {
				log.Fatalf("[Speth's Screens] %v", err)
			}
			*dataDir = d
		}
		if *addr == "" {
			if running, ok := runningInstance(); ok {
				log.Printf("[Speth's Screens] already running on %s; opening it", running)
				if !*noBrowser {
					_ = openBrowser("http://" + running + "/ide/")
				}
				return
			}
			a, err := pickDesktopAddr()
			if err != nil {
				log.Fatalf("[Speth's Screens] %v", err)
			}
			*addr = a
		}
	}
	// A project named on the command line must exist; the data folder's own may not yet.
	explicitProject := *projectPath != ""
	if *dataDir != "" {
		if err := os.MkdirAll(*dataDir, 0o755); err != nil {
			log.Fatalf("[Speth's Screens] data folder: %v", err)
		}
		for _, f := range []*string{historyDB, alarmDB, versionDB, securityDB, auditDB, recipeDB, memoryDB, targetsFile} {
			*f = inDataDir(*dataDir, *f)
		}
		log.Printf("[Speth's Screens] data folder: %s", *dataDir)
		// The data folder's project: loaded when it is there, and where a deploy is kept.
		if *projectPath == "" {
			*projectPath = filepath.Join(*dataDir, "project.screens.json")
		}
	}

	if *addr == "" {
		switch *mode {
		case "runtime":
			*addr = ":8080"
		default:
			*addr = "127.0.0.1:3001"
		}
	}
	if *mode == "dev" {
		if err := checkDevAddr(*addr); err != nil {
			log.Fatalf("[Speth's Screens] %v", err)
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
	// Made-up values only where demonstrations happen: the desktop program, or when asked for.
	rt.AllowSimulation = *allowSimulation || desktop
	if rt.AllowSimulation {
		log.Printf("[Speth's Screens] simulation allowed: a project with simulation on shows made-up values (for demonstrations, not production)")
	}
	rt.AlarmStore = alarmSt
	memSt, err := memstore.Open(*memoryDB)
	if err != nil {
		log.Fatalf("[Speth's Screens] memstore: %v", err)
	}
	defer memSt.Close()
	rt.Retain = memSt

	// Security: the user store is always open. Whether logins are needed
	// comes from the project's security.mode; the first admin is created
	// when a project asks for logins and there are no users (see
	// runtime.LoadProject), with its password in a file next to the store.
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
		rt.InitialAdminFile = filepath.Join(filepath.Dir(*securityDB), "initial-admin-password")
		// Earlier builds created admin/admin on first run; make it change.
		if flagged, err := secSt.FlagDefaultPassword(context.Background()); err != nil {
			log.Printf("[Speth's Screens] security: %v", err)
		} else if flagged {
			log.Printf("[SECURITY] WARNING: user \"admin\" still has the default password \"admin\"; it must be changed at next login")
		}
		users, _ := secSt.ListUsers(context.Background())
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

	if *projectPath != "" && (explicitProject || fileExists(*projectPath)) {
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
	ideOn := false
	if *mode == "runtime" {
		var ide fs.FS
		if !*noIDE {
			ide = ideFS() // nil unless the program was built with the IDE
		}
		assets = uiHandler(spaHandler(), ide)
		ideOn = ide != nil
		if ide != nil {
			log.Printf("[Speth's Screens] the IDE is at /ide/ on this address")
		}
	}
	srv := api.New(rt, assets, versionSt)
	srv.DevMode = *mode == "dev"
	srv.Version = version
	srv.ProjectFile = *projectPath
	// The program that serves the IDE (dev mode, or a runtime built with it) relays the IDE's requests to the
	// saved deploy targets; a runtime without the IDE, such as the panel's, has no relay.
	if *mode == "dev" || ideOn {
		ts, err := targets.Open(*targetsFile)
		if err != nil {
			log.Fatalf("[Speth's Screens] deploy targets: %v", err)
		}
		srv.Targets = ts
	}
	srv.AllowedOrigins = append(append([]string(nil), api.DefaultAllowedOrigins...), splitList(*corsOrigins)...)

	httpSrv := &http.Server{
		Addr:              *addr,
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	ln, err := net.Listen("tcp", *addr)
	if err != nil {
		log.Fatalf("[Speth's Screens] HTTP: %v", err)
	}
	go func() {
		log.Printf("[Speth's Screens] HTTP serving on %s", *addr)
		if err := httpSrv.Serve(ln); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[Speth's Screens] HTTP: %v", err)
		}
	}()
	if desktop {
		url := "http://" + *addr + "/ide/"
		log.Printf("[Speth's Screens] open %s  (close this window to stop)", url)
		if !*noBrowser {
			if err := openBrowser(url); err != nil {
				log.Printf("[Speth's Screens] could not open the browser: %v", err)
			}
		}
	}

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

// checkDevAddr refuses a dev-mode listen address that is not on this
// machine: dev mode skips logins, so it must not be reachable from the
// network.
func checkDevAddr(addr string) error {
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		return fmt.Errorf("dev mode: bad listen address %q: %w", addr, err)
	}
	if host == "localhost" {
		return nil
	}
	if ip := net.ParseIP(host); ip != nil && ip.IsLoopback() {
		return nil
	}
	return fmt.Errorf("dev mode skips logins, so it listens on this machine only; use --addr=127.0.0.1:<port> (got %q), or --mode=runtime", addr)
}

func fileExists(p string) bool {
	st, err := os.Stat(p)
	return err == nil && !st.IsDir()
}

// splitList splits a comma-separated flag value, dropping empty items.
func splitList(v string) []string {
	var out []string
	for _, item := range strings.Split(v, ",") {
		if item = strings.TrimSpace(item); item != "" {
			out = append(out, item)
		}
	}
	return out
}
