package script

// Memory limits. goja has no per-VM memory limit and the heap is shared, so
// the engine cannot ask "how much does this script hold?" of the runtime.
// Two things keep a script's memory bounded instead:
//
//   - guards (guards.go): the few built-ins that allocate a lot in one call,
//     which the time budget cannot interrupt, refuse a request over a limit
//     with a RangeError the script can catch;
//   - accounting (this file): what a script keeps between runs, its `state`
//     and the global variables it makes, is estimated after a run (at most
//     every memCheckEvery) and the script is stopped when it is over
//     MaxStateBytes. A run that stays under the time budget can otherwise
//     grow `state` for ever without being interrupted.
//
// Local variables of a run die with it, and what is left open is bounded only
// by the time budget (measured on one PC, with the guards in place):
//
//   - s += s in a loop reached 1 GB in 162 ms (plain + cannot be wrapped and
//     goja has no string length limit);
//   - a loop of many allocations under the limits kept about 300 MB inside one
//     100 ms run, and the allocation rate is the machine's memory bandwidth
//     whatever the size of each piece;
//   - spread ([...a]) over a very long sparse array.
//
// So this is protection against mistakes and slow leaks, not a hard ceiling;
// one is only possible with the scripts in a process the operating system
// limits.

import (
	"fmt"
	"strings"
	"time"

	"github.com/dop251/goja"
)

// Memory limits; tests lower them.
var (
	// MaxStateBytes: the estimated size of `state` plus the script's own globals.
	MaxStateBytes = 8 << 20
	// MaxStringChars: the longest string repeat, padStart and padEnd will build.
	MaxStringChars = 8 << 20
	// MaxArrayLength: the longest array Array(n), new Array(n), fill and Array.from will build.
	MaxArrayLength = 1_000_000
	// MaxBufferBytes: the largest ArrayBuffer or typed array a script may create.
	MaxBufferBytes = 8 << 20
	// MaxLogBytes: a log line longer than this is cut.
	MaxLogBytes = 16 << 10
	// MaxEmitBytes: the estimated size of an emit payload.
	MaxEmitBytes = 1 << 20

	memCheckEvery = 500 * time.Millisecond
)

// sizer estimates the bytes a JavaScript value keeps alive, walking objects
// and arrays once each (cycles are safe) and giving up as soon as the total
// passes limit. The numbers are a model, not a measurement: a string counts
// its length plus 16, a number 8, an object 56 plus its keys and values, an
// array element 16 plus its value, a function 64, a typed array its bytes.
type sizer struct {
	limit  int64
	total  int64
	seen   map[*goja.Object]struct{}
	tag    *goja.Symbol // Symbol.toStringTag: what an object calls itself (Map, Uint8Array, ...)
	failed bool         // reading a value threw (a getter or a proxy); the estimate is then incomplete
}

func newSizer(vm *goja.Runtime, limit int) *sizer {
	s := &sizer{limit: int64(limit), seen: map[*goja.Object]struct{}{}}
	if sym, ok := vm.Get("Symbol").ToObject(vm).Get("toStringTag").(*goja.Symbol); ok {
		s.tag = sym
	}
	return s
}

// kind is what the object calls itself ("Map", "Uint8Array"), or "" for a plain object or array.
func (s *sizer) kind(obj *goja.Object) string {
	if s.tag == nil {
		return ""
	}
	if v := obj.GetSymbol(s.tag); v != nil && !goja.IsUndefined(v) {
		return v.String()
	}
	return ""
}

func (s *sizer) over() bool { return s.total > s.limit }

// add counts v. Reading properties can run script code (getters, proxies),
// which can throw, so a panic ends the walk instead of the process.
func (s *sizer) add(v goja.Value) {
	defer func() {
		if recover() != nil {
			s.failed = true
		}
	}()
	s.walk(v)
}

func (s *sizer) walk(v goja.Value) {
	if v == nil || s.over() {
		return
	}
	if goja.IsUndefined(v) || goja.IsNull(v) {
		s.total++
		return
	}
	obj, isObject := v.(*goja.Object)
	if !isObject {
		switch x := v.Export().(type) {
		case string:
			s.total += int64(len(x)) + 16
		case bool:
			s.total++
		default:
			s.total += 8
		}
		return
	}
	if _, again := s.seen[obj]; again {
		return
	}
	s.seen[obj] = struct{}{}

	if obj.ClassName() == "Function" {
		s.total += 64
		return
	}
	kind := s.kind(obj)
	switch {
	case kind == "ArrayBuffer" || kind == "DataView" || strings.HasSuffix(kind, "Array"):
		// A typed array or buffer: its bytes, without listing every index.
		s.total += 64
		if n := obj.Get("byteLength"); n != nil && !goja.IsUndefined(n) {
			s.total += n.ToInteger()
		}
		return
	case kind == "Map" || kind == "Set":
		s.total += 64
		if n := obj.Get("size"); n != nil && !goja.IsUndefined(n) {
			s.total += n.ToInteger() * 48
		}
		return
	}
	s.total += 56
	for _, k := range obj.Keys() {
		s.total += int64(len(k)) + 16
		s.walk(obj.Get(k))
		if s.over() {
			return
		}
	}
}

// scriptBytes estimates what the script keeps between runs: `state` and the
// global variables it made (anything not in the baseline taken when the
// script was loaded). It stops counting once over the limit.
func (r *runner) scriptBytes(vm *goja.Runtime) int64 {
	s := newSizer(vm, MaxStateBytes)
	s.add(vm.Get("state"))
	g := vm.GlobalObject()
	for _, k := range g.Keys() {
		if _, builtin := r.baseline[k]; builtin {
			continue
		}
		s.total += int64(len(k)) + 16
		s.add(g.Get(k))
		if s.over() {
			break
		}
	}
	return s.total
}

// baselineGlobals records the global names that are not the script's own:
// the API, `state` and `event`.
func baselineGlobals(vm *goja.Runtime) map[string]struct{} {
	names := map[string]struct{}{"event": {}}
	for _, k := range vm.GlobalObject().Keys() {
		names[k] = struct{}{}
	}
	return names
}

// overLimit reports whether the script has been stopped for keeping too much
// between runs. It measures at most every memCheckEvery.
func (r *runner) overLimit(vm *goja.Runtime) bool {
	if time.Since(r.lastMem) < memCheckEvery {
		return false
	}
	r.lastMem = time.Now()
	if r.scriptBytes(vm) <= int64(MaxStateBytes) {
		return false
	}
	r.setStopped(fmt.Sprintf("its state and global variables use more than %s (estimated); the script memory limit", megabytes(MaxStateBytes)))
	return true
}

// megabytes writes a byte count for a message: "8 MB", or in KB below 1 MB.
func megabytes(n int) string {
	if n >= 1<<20 {
		return fmt.Sprintf("%d MB", n>>20)
	}
	return fmt.Sprintf("%d KB", n>>10)
}

// capLog cuts a log line to MaxLogBytes.
func capLog(line string) string {
	if len(line) <= MaxLogBytes {
		return line
	}
	return fmt.Sprintf("%s… (%d more bytes cut)", line[:MaxLogBytes], len(line)-MaxLogBytes)
}

// rangeError is a JavaScript RangeError to panic with from a Go function.
func rangeError(vm *goja.Runtime, msg string) *goja.Object {
	if o, err := vm.New(vm.Get("RangeError"), vm.ToValue(msg)); err == nil {
		return o
	}
	return vm.NewTypeError(msg)
}
