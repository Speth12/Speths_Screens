package script

import (
	"os"
	"regexp"
	"strings"
	"testing"

	"github.com/dop251/goja"

	"github.com/Speth12/Speths_Screens/internal/project"
)

// apiMembers reads the member names of one interface in the shared API
// definition, packages/script-api/api.d.ts.
func apiMembers(t *testing.T, iface string) []string {
	t.Helper()
	b, err := os.ReadFile("../../packages/script-api/api.d.ts")
	if err != nil {
		t.Fatal(err)
	}
	src := strings.ReplaceAll(string(b), "\r\n", "\n")
	start := strings.Index(src, "export interface "+iface+" {")
	if start < 0 {
		t.Fatalf("api.d.ts has no interface %s", iface)
	}
	body := src[start:]
	body = body[strings.Index(body, "{")+1 : strings.Index(body, "\n}")]
	member := regexp.MustCompile(`(?m)^  ([A-Za-z_]\w*)\s*[(:]`)
	var out []string
	for _, m := range member.FindAllStringSubmatch(body, -1) {
		out = append(out, m[1])
	}
	if len(out) == 0 {
		t.Fatalf("no members read from %s", iface)
	}
	return out
}

// Every name the shared definition gives runtime scripts exists in the VM,
// and no page-only name does.
func TestRuntimeAPIMatchesTheDefinition(t *testing.T) {
	r := newRunner(project.RuntimeScript{ID: "api", Source: ""}, nil, &fakeHost{})
	vm := goja.New()
	if _, err := r.compile(vm); err != nil {
		t.Fatal(err)
	}
	_ = vm.Set("event", map[string]any{"kind": "start"})
	for _, iface := range []string{"CommonApi", "RuntimeScriptApi"} {
		for _, name := range apiMembers(t, iface) {
			if v := vm.Get(name); v == nil || goja.IsUndefined(v) {
				t.Errorf("%s.%s is not defined in runtime scripts", iface, name)
			}
		}
	}
	for _, name := range apiMembers(t, "PageScriptApi") {
		if name == "log" || name == "emit" {
			continue
		}
		if v := vm.Get(name); v != nil && !goja.IsUndefined(v) {
			t.Errorf("page-only %s is defined in runtime scripts", name)
		}
	}
}
