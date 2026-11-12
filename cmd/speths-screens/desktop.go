package main

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"time"
)

// Desktop mode: a program built with the IDE, started with no arguments (a double-click), runs as a runtime for this
// computer only, keeps its files in one folder, picks a free port and opens the IDE in the browser.

const (
	desktopFirstPort = 8080
	desktopPortCount = 20
)

// isDesktopStart says whether the program was started the desktop way: no arguments, or --desktop, and it has the IDE.
func isDesktopStart(args []string, explicit, hasIDE bool) bool {
	return hasIDE && (explicit || len(args) == 0)
}

// defaultDataDir is the folder a desktop program keeps its databases and settings in.
func defaultDataDir() (string, error) {
	var base string
	switch runtime.GOOS {
	case "windows":
		base = os.Getenv("LOCALAPPDATA")
	case "darwin":
		if home, err := os.UserHomeDir(); err == nil {
			base = filepath.Join(home, "Library", "Application Support")
		}
	default:
		base = os.Getenv("XDG_DATA_HOME")
		if base == "" {
			if home, err := os.UserHomeDir(); err == nil {
				base = filepath.Join(home, ".local", "share")
			}
		}
	}
	if base == "" {
		return "", fmt.Errorf("cannot tell where to keep data; pass --data-dir")
	}
	return filepath.Join(base, "Speths Screens"), nil
}

// inDataDir places a relative file name inside the data folder. An empty name, ":memory:" and an absolute path stay
// as they are.
func inDataDir(dir, name string) string {
	if dir == "" || name == "" || name == ":memory:" || filepath.IsAbs(name) {
		return name
	}
	return filepath.Join(dir, name)
}

// pickDesktopAddr finds the first free loopback port from 8080.
func pickDesktopAddr() (string, error) {
	for p := desktopFirstPort; p < desktopFirstPort+desktopPortCount; p++ {
		addr := net.JoinHostPort("127.0.0.1", strconv.Itoa(p))
		l, err := net.Listen("tcp", addr)
		if err == nil {
			l.Close()
			return addr, nil
		}
	}
	return "", fmt.Errorf("ports %d to %d on this computer are all in use; pass --addr", desktopFirstPort, desktopFirstPort+desktopPortCount-1)
}

// runningInstance returns the address of a Speth's Screens program already answering on this computer's desktop
// ports, so a second start opens the browser on it instead of starting another.
func runningInstance() (string, bool) {
	c := &http.Client{Timeout: 400 * time.Millisecond}
	for p := desktopFirstPort; p < desktopFirstPort+desktopPortCount; p++ {
		addr := net.JoinHostPort("127.0.0.1", strconv.Itoa(p))
		resp, err := c.Get("http://" + addr + "/api/v1/alive")
		if err != nil {
			continue
		}
		var body struct {
			OK      bool   `json:"ok"`
			Version string `json:"version"`
		}
		err = json.NewDecoder(resp.Body).Decode(&body)
		resp.Body.Close()
		if err == nil && body.OK && body.Version != "" {
			return addr, true
		}
	}
	return "", false
}

// openBrowser opens a URL in the person's default browser.
func openBrowser(url string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	case "darwin":
		cmd = exec.Command("open", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	return cmd.Start()
}
