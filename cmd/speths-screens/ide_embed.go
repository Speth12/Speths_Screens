//go:build ide

package main

import (
	"embed"
	"io/fs"
	"log"
)

// The IDE build (npm run build --workspace=packages/ide, copied to cmd/speths-screens/ide by the release script).
// Only programs built with -tags ide have it; the panel package does not.
//
//go:embed all:ide
var ideFiles embed.FS

func ideFS() fs.FS {
	sub, err := fs.Sub(ideFiles, "ide")
	if err != nil {
		log.Fatalf("[Speth's Screens] embed ide: %v", err)
	}
	return sub
}
