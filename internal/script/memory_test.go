package script

import (
	"fmt"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/dop251/goja"

	"github.com/Speth12/Speths_Screens/internal/project"
	"github.com/Speth12/Speths_Screens/internal/tagstore"
)

// runBody runs a script body once (onStart) and returns what it logged, its
// last error and the bytes the process allocated meanwhile.
func runBody(t *testing.T, body string) (logs []string, lastErr string, allocated uint64) {
	t.Helper()
	var before, after runtime.MemStats
	runtime.ReadMemStats(&before)
	h := &fakeHost{}
	e := start(t, tagstore.New(), h, project.RuntimeScript{
		ID: "s", Trigger: project.ScriptTrigger{OnStart: ptrBool(true)}, Source: body,
	})
	eventually(t, "the script to finish", func() bool {
		_, l, _ := h.snapshot()
		return len(l) > 0 || e.Status()[0].LastError != ""
	})
	runtime.ReadMemStats(&after)
	_, logs, _ = h.snapshot()
	return logs, e.Status()[0].LastError, after.TotalAlloc - before.TotalAlloc
}

// withLimits sets the state limit and the measuring interval for a test.
func withLimits(t *testing.T, stateBytes int, every time.Duration) {
	t.Helper()
	oldBytes, oldEvery := MaxStateBytes, memCheckEvery
	MaxStateBytes, memCheckEvery = stateBytes, every
	t.Cleanup(func() { MaxStateBytes, memCheckEvery = oldBytes, oldEvery })
}

func TestGuardsRefuseHugeAllocations(t *testing.T) {
	cases := []struct{ name, expr string }{
		{"repeat", `'x'.repeat(2 ** 28)`},
		{"repeat of a longer string", `'abc'.repeat(2 ** 30)`},
		{"padStart", `'x'.padStart(2 ** 28)`},
		{"padEnd", `'x'.padEnd(2 ** 28, 'ab')`},
		{"Array(n)", `Array(5e7)`},
		{"new Array(n)", `new Array(5e7)`},
		{"new Array(n).fill", `new Array(5e7).fill(0)`},
		{"Array.from an array-like", `Array.from({ length: 5e7 })`},
		{"ArrayBuffer", `new ArrayBuffer(2 ** 30)`},
		{"Uint8Array", `new Uint8Array(2 ** 30)`},
		{"Float64Array", `new Float64Array(2 ** 28)`},
		{"concat on a sparse array", `(function () { var a = []; a[4e8] = 1; return a.concat([1]); })()`},
		{"concat of a sparse array", `[1].concat((function () { var a = []; a.length = 5e7; return a; })())`},
		{"slice on a long array", `(function () { var a = []; a.length = 5e7; return a.slice(); })()`},
		{"map on a long array", `(function () { var a = []; a.length = 5e7; return a.map(function (x) { return x; }); })()`},
		{"join on a long array", `(function () { var a = []; a.length = 5e7; return a.join('xx'); })()`},
		{"forEach on a long array", `(function () { var a = []; a.length = 5e7; a.forEach(function () {}); })()`},
		{"stringify of a long array", `(function () { var a = []; a.length = 5e7; return JSON.stringify(a); })()`},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			logs, lastErr, allocated := runBody(t, "void ("+c.expr+"); log('built');")
			if !strings.Contains(lastErr, "RangeError") || !strings.Contains(lastErr, "script memory limit") {
				t.Errorf("last error %q, logs %q", lastErr, logs)
			}
			for _, l := range logs {
				if strings.Contains(l, "built") {
					t.Errorf("the allocation went ahead: %q", logs)
				}
			}
			if allocated > 64<<20 {
				t.Errorf("allocated %d MB before refusing", allocated>>20)
			}
		})
	}
}

func TestGuardsLeaveOrdinaryCodeAlone(t *testing.T) {
	cases := []struct{ name, body string }{
		{"repeat", `return 'x'.repeat(1000).length === 1000;`},
		{"padStart and padEnd", `return '7'.padStart(5, '0') === '00007' && 'ab'.padEnd(5, '-') === 'ab---';`},
		{"Array(n)", `return Array(10).length === 10 && new Array(1000).length === 1000;`},
		{"Array with values", `return new Array(3, 4).length === 2 && Array('a').length === 1 && Array(3, 4)[1] === 4;`},
		{"fill", `return Array(10).fill(1).every(function (v) { return v === 1; });`},
		{"Array.from", `return Array.from({ length: 100 }, function (_, i) { return i; }).length === 100;`},
		{"Array.from an iterable", `return Array.from(new Set([1, 2, 3])).length === 3 && Array.from('abc').length === 3;`},
		{"Array.of and statics", `return Array.of(1, 2).length === 2 && Array.isArray([1]) && typeof Array.prototype.map === 'function';`},
		{"instanceof and constructor", `return [] instanceof Array && [].constructor === Array && new Array(2) instanceof Array;`},
		{"a subclass", `class Stack extends Array {} return new Stack(5).length === 5 && new Stack() instanceof Array && new Stack() instanceof Stack;`},
		{"typed arrays and buffers", `return new Uint8Array(1024).length === 1024 && new Float64Array([1, 2]).length === 2 && new ArrayBuffer(16).byteLength === 16;`},
		{"array methods", `var a = [3, 1, 2]; return a.concat([4]).length === 4 && a.slice(1).length === 2 && a.map(function (x) { return x * 2; })[0] === 6 && a.filter(function (x) { return x > 1; }).length === 2 && a.join('-') === '3-1-2' && a.indexOf(2) === 2 && a.includes(1) && a.some(function (x) { return x === 3; }) && a.every(function (x) { return x > 0; }) && a.reduce(function (s, x) { return s + x; }, 0) === 6 && a.slice().sort()[0] === 1 && a.slice().reverse()[0] === 2 && String(a) === '3,1,2';`},
		{"array methods on array-likes and long ordinary arrays", `var b = Array.prototype.slice.call({ length: 2, 0: 'a', 1: 'b' }); var big = Array(5000).fill(1); return b.join('') === 'ab' && big.map(function (x) { return x; }).length === 5000 && big.indexOf(2) === -1;`},
		{"JSON", `return JSON.stringify([1, 2]) === '[1,2]' && JSON.stringify({ a: 1 }) === '{"a":1}' && JSON.parse('[1]').length === 1;`},
		{"a RangeError the script can catch", `try { 'x'.repeat(2 ** 28); } catch (e) { return e instanceof RangeError; } return false;`},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			logs, lastErr, _ := runBody(t, "log((function () { "+c.body+" })() ? 'ok' : 'wrong');")
			if lastErr != "" || len(logs) != 1 || logs[0] != "s: ok" {
				t.Errorf("last error %q, logs %q", lastErr, logs)
			}
		})
	}
}

func TestGuardsUseTheCurrentLimits(t *testing.T) {
	old := MaxStringChars
	MaxStringChars = 100
	t.Cleanup(func() { MaxStringChars = old })
	for _, c := range []struct {
		n  int
		ok bool
	}{{100, true}, {101, false}} {
		logs, lastErr, _ := runBody(t, fmt.Sprintf("log('x'.repeat(%d).length);", c.n))
		if c.ok != (lastErr == "") {
			t.Errorf("repeat(%d): last error %q, logs %q", c.n, lastErr, logs)
		}
	}
}

func TestStateGrowthStopsTheScript(t *testing.T) {
	withLimits(t, 1<<20, 0)
	h := &fakeHost{}
	e := start(t, tagstore.New(), h, project.RuntimeScript{
		ID: "grow", Trigger: project.ScriptTrigger{OnStart: ptrBool(true), Every: ptrInt(100)},
		// 300 KB a run: far under the time budget, so nothing interrupts it.
		Source: `state.s = (state.s ?? '') + 'x'.repeat(300000);`,
	})
	eventually(t, "the script to be stopped", func() bool { return e.Status()[0].State == "stopped" })
	st := e.Status()[0]
	if !strings.Contains(st.Reason, "state and global variables") || !strings.Contains(st.Reason, "memory limit") || !strings.Contains(st.Reason, "1 MB") {
		t.Errorf("reason %q", st.Reason)
	}
	if st.Runs < 3 || st.Runs > 8 {
		t.Errorf("stopped after %d runs, want about 4", st.Runs)
	}
}

func TestGlobalVariablesCountToo(t *testing.T) {
	withLimits(t, 1<<20, 0)
	h := &fakeHost{}
	e := start(t, tagstore.New(), h, project.RuntimeScript{
		ID: "leak", Trigger: project.ScriptTrigger{OnStart: ptrBool(true), Every: ptrInt(100)},
		// An undeclared assignment makes a global, which outlives the run.
		Source: `leak = (typeof leak === 'undefined' ? '' : leak) + 'x'.repeat(300000);`,
	})
	eventually(t, "the script to be stopped", func() bool { return e.Status()[0].State == "stopped" })
	if r := e.Status()[0].Reason; !strings.Contains(r, "memory limit") {
		t.Errorf("reason %q", r)
	}
}

func TestSmallStateKeepsRunning(t *testing.T) {
	withLimits(t, MaxStateBytes, 0)
	store := tagstore.New()
	h := &fakeHost{}
	e := start(t, store, h, project.RuntimeScript{
		ID: "small", Trigger: project.ScriptTrigger{OnChange: []string{"plc:V"}},
		Source: `state.n = (state.n ?? 0) + 1; state.last = ((state.last ?? []).concat([event.value])).slice(-10);`,
	})
	for i := 0; i < 20; i++ {
		store.Update("plc:V", tagstore.TagState{Value: float64(i), Quality: "Good"})
		time.Sleep(15 * time.Millisecond)
	}
	eventually(t, "the runs", func() bool { return e.Status()[0].Runs >= 15 })
	if st := e.Status()[0]; st.State != "running" || st.LastError != "" {
		t.Errorf("status %+v", st)
	}
}

func TestMeasuringIsThrottled(t *testing.T) {
	// With a long interval the first run is measured and the next ones are not,
	// so a script that grows past the limit is only caught at the next measurement.
	withLimits(t, 1<<20, time.Hour)
	h := &fakeHost{}
	e := start(t, tagstore.New(), h, project.RuntimeScript{
		ID: "grow", Trigger: project.ScriptTrigger{OnStart: ptrBool(true), Every: ptrInt(100)},
		Source: `state.s = (state.s ?? '') + 'x'.repeat(300000);`,
	})
	eventually(t, "several runs", func() bool { return e.Status()[0].Runs >= 8 })
	if st := e.Status()[0]; st.State != "running" {
		t.Errorf("stopped between measurements: %+v", st)
	}
}

func TestLogLinesAndEmitPayloadsAreCapped(t *testing.T) {
	// Small limits, so the script has almost nothing to do: under -race a script
	// that builds megabytes of text can use up its time budget.
	oldLog, oldEmit := MaxLogBytes, MaxEmitBytes
	MaxLogBytes, MaxEmitBytes = 1000, 10000
	t.Cleanup(func() { MaxLogBytes, MaxEmitBytes = oldLog, oldEmit })
	h := &fakeHost{}
	start(t, tagstore.New(), h, project.RuntimeScript{
		ID: "s", Trigger: project.ScriptTrigger{OnStart: ptrBool(true)},
		Source: `
			log('y'.repeat(5000));
			try { emit('big', 'z'.repeat(50000)); log('not caught'); }
			catch (e) { log('caught', e instanceof RangeError); }
			emit('small', { a: 1 });`,
	})
	eventually(t, "the script's lines", func() bool { _, logs, ev := h.snapshot(); return len(logs) >= 2 && len(ev) >= 1 })
	_, logs, events := h.snapshot()
	if len(logs[0]) > MaxLogBytes+100 || !strings.Contains(logs[0], "4000 more bytes cut") {
		t.Errorf("log line of %d bytes: ...%q", len(logs[0]), logs[0][len(logs[0])-40:])
	}
	if logs[1] != "s: caught true" {
		t.Errorf("logs %q", logs[1:])
	}
	if len(events) != 1 || !strings.HasPrefix(events[0], "s small") {
		t.Errorf("events %q", events)
	}
}

func TestSizerEstimates(t *testing.T) {
	vm := goja.New()
	size := func(src string, limit int) int64 {
		t.Helper()
		v, err := vm.RunString(src)
		if err != nil {
			t.Fatal(err)
		}
		s := newSizer(vm, limit)
		s.add(v)
		return s.total
	}
	cases := []struct {
		name, src string
		lo, hi    int64
	}{
		{"undefined", `undefined`, 1, 1},
		{"null", `null`, 1, 1},
		{"a flag", `true`, 1, 1},
		{"a number", `42`, 8, 8},
		{"a string is its length and 16", `'x'.repeat(1000)`, 1016, 1016},
		{"a function", `(function () {})`, 64, 64},
		{"a typed array is its bytes", `new Uint8Array(4096)`, 4096 + 64, 4096 + 64},
		{"a buffer is its bytes", `new ArrayBuffer(1000)`, 1000 + 64, 1000 + 64},
		{"a map counts its entries", `new Map([[1, 2], [3, 4]])`, 64 + 2*48, 64 + 2*48},
		{"an array of numbers", `new Array(1000).fill(1)`, 1000 * 8, 1000 * 40},
		{"nested objects", `({ a: { b: 'hello' } })`, 100, 300},
		{"a cycle ends", `(function () { var a = {}; a.self = a; return a; })()`, 56, 150},
		{"a shared value counts once", `(function () { var s = { big: 'x'.repeat(10000) }; return [s, s, s]; })()`, 10000, 11000},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := size(c.src, 1<<30); got < c.lo || got > c.hi {
				t.Errorf("%s: %d, want %d to %d", c.src, got, c.lo, c.hi)
			}
		})
	}

	t.Run("gives up past the limit without walking everything", func(t *testing.T) {
		v, err := vm.RunString(`new Array(1e6).fill('xxxxxxxxxx')`)
		if err != nil {
			t.Fatal(err)
		}
		s := newSizer(vm, 1000)
		begin := time.Now()
		s.add(v)
		// 1e6 elements walked in full would count over 20 MB; giving up stops far short of that.
		if s.total <= 1000 || s.total > 1<<20 {
			t.Errorf("total %d, want just past the limit", s.total)
		}
		if took := time.Since(begin); took > 2*time.Second {
			t.Errorf("walk took %v", took)
		}
	})

	t.Run("a getter that throws ends the walk, not the process", func(t *testing.T) {
		v, err := vm.RunString(`({ get boom() { throw new Error('no'); } })`)
		if err != nil {
			t.Fatal(err)
		}
		s := newSizer(vm, 1<<20)
		s.add(v)
		if !s.failed {
			t.Error("want the walk to report it could not finish")
		}
	})
}
