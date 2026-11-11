//go:build !ide

package main

import "io/fs"

// ideFS is nil in a program built without the IDE.
func ideFS() fs.FS { return nil }
