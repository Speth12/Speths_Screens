package main

import (
	"fmt"
	"runtime"
	"runtime/debug"
)

// Set at build time: go build -ldflags "-X main.version=v0.8.0 -X main.commit=abc1234".
var (
	version = "dev"
	commit  = ""
)

// versionString reads "speths-screens v0.8.0 (abc1234) linux/arm64". Without -X flags the commit comes from the
// build's own VCS stamp, when there is one.
func versionString() string {
	c := commit
	if c == "" {
		if info, ok := debug.ReadBuildInfo(); ok {
			for _, s := range info.Settings {
				if s.Key == "vcs.revision" && len(s.Value) >= 7 {
					c = s.Value[:7]
				}
			}
		}
	}
	if c != "" {
		c = " (" + c + ")"
	}
	return fmt.Sprintf("speths-screens %s%s %s/%s", version, c, runtime.GOOS, runtime.GOARCH)
}
