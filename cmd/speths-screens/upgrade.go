package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"

	"github.com/Speth12/Speths_Screens/internal/project"
)

// runUpgrade is `speths-screens upgrade [-o out] <file>`: it upgrades a
// project file to the current format and checks it against schema.json.
// Without -o the file is rewritten and the original kept as <file>.bak.
// Nothing is written when the upgraded project does not validate.
func runUpgrade(args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("upgrade", flag.ContinueOnError)
	fs.SetOutput(stderr)
	out := fs.String("o", "", "write the upgraded project here instead of rewriting the file")
	fs.Usage = func() {
		fmt.Fprintln(stderr, "usage: speths-screens upgrade [-o out.json] <project.json>")
		fs.PrintDefaults()
	}
	if err := fs.Parse(args); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fs.Usage()
		return 2
	}
	path := fs.Arg(0)
	data, err := os.ReadFile(path)
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	upgraded, notes, err := project.Upgrade(data)
	if err != nil {
		fmt.Fprintf(stderr, "%s: %v\n", path, err)
		return 1
	}
	if bytes.Equal(upgraded, data) && *out == "" {
		fmt.Fprintf(stdout, "%s is already format %d\n", path, project.CurrentSchemaVersion)
		return 0
	}
	if err := project.ValidateJSON(upgraded); err != nil {
		fmt.Fprintf(stderr, "%s: not written: %v\n", path, err)
		return 1
	}
	var pretty bytes.Buffer
	if err := json.Indent(&pretty, upgraded, "", "  "); err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	pretty.WriteByte('\n')

	dest := *out
	if dest == "" {
		dest = path
		if err := os.WriteFile(path+".bak", data, 0o644); err != nil {
			fmt.Fprintln(stderr, err)
			return 1
		}
		fmt.Fprintf(stdout, "kept the original as %s.bak\n", path)
	}
	if err := os.WriteFile(dest, pretty.Bytes(), 0o644); err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	for _, n := range notes {
		fmt.Fprintf(stdout, "  %s\n", n)
	}
	fmt.Fprintf(stdout, "wrote %s (format %d, %d change(s) dropped)\n", dest, project.CurrentSchemaVersion, len(notes))
	return 0
}
