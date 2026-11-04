package script

// Guards for the built-ins that can allocate a lot in a single call. The time
// budget stops a loop between instructions, but not a native call: measured,
// 'x'.repeat(2**28) ran for 654 ms and kept 257 MB, and new Array(5e7).fill(0)
// ran for 6.5 s and peaked at 1.6 GB, both far past the 100 ms budget. Each
// guard checks the size the call asks for and throws a RangeError first, so
// nothing is allocated and the script can catch the error.
//
// The prelude is JavaScript run once in each VM before the script; it keeps
// the originals in its closure. A script written to get around it can (it can
// reach other intrinsics), so this protects against mistakes, not against a
// hostile author; scripts from authors who are not trusted need a separate
// process with an operating system limit.

import (
	"fmt"

	"github.com/dop251/goja"
)

const guardsJS = `(function (G, MAX_STR, MAX_ARR, MAX_BUF) {
  "use strict";
  var rapply = Reflect.apply, rconstruct = Reflect.construct, defineProperty = Object.defineProperty;

  function tooLarge(what, limit, unit) {
    return new RangeError(what + " larger than " + limit + " " + unit + " (the script memory limit)");
  }

  // Replaces a method by one that runs check(this, arguments) first.
  function guardMethod(owner, name, check) {
    var original = owner[name];
    if (typeof original !== "function") return;
    var guarded = function () { check(this, arguments); return rapply(original, this, arguments); };
    defineProperty(guarded, "name", { value: name, configurable: true });
    defineProperty(owner, name, { value: guarded, writable: true, configurable: true, enumerable: false });
  }

  // Replaces a global constructor by a function that runs check(arguments)
  // before it builds anything. It is a real function, not a Proxy (goja does
  // not accept a Proxy in instanceof), that shares the original's prototype,
  // so instanceof, subclasses and the statics (Array.isArray, BYTES_PER_ELEMENT)
  // keep working. Returns the original.
  function guardConstructor(name, check) {
    var Original = G[name];
    if (typeof Original !== "function") return;
    var Guarded = function () {
      check(arguments);
      if (new.target) return rconstruct(Original, arguments, new.target === Guarded ? Original : new.target);
      return rapply(Original, this, arguments);
    };
    defineProperty(Guarded, "name", { value: name, configurable: true });
    defineProperty(Guarded, "length", { value: Original.length, configurable: true });
    Guarded.prototype = Original.prototype;
    Object.setPrototypeOf(Guarded, Original);
    defineProperty(Original.prototype, "constructor", { value: Guarded, writable: true, configurable: true, enumerable: false });
    G[name] = Guarded;
    return Original;
  }

  var checkString = function (self, args) {
    if (Number(args[0]) > MAX_STR) throw tooLarge("string", MAX_STR, "characters");
  };
  guardMethod(String.prototype, "repeat", function (self, args) {
    if (String(self).length * Number(args[0]) > MAX_STR) throw tooLarge("string", MAX_STR, "characters");
  });
  guardMethod(String.prototype, "padStart", checkString);
  guardMethod(String.prototype, "padEnd", checkString);

  // Setting a huge length is free (a.length = 5e7), but a method that walks the
  // length then runs for as long as it takes, past the time budget: measured,
  // a[4e8] = 1; a.concat([1]) ran for 26 s and allocated 5.3 GB.
  ["concat", "copyWithin", "every", "fill", "filter", "find", "findIndex", "flat", "flatMap", "forEach", "includes",
   "indexOf", "join", "lastIndexOf", "map", "reduce", "reduceRight", "reverse", "shift", "slice", "some", "sort",
   "splice", "toString", "unshift"].forEach(function (name) {
    guardMethod(Array.prototype, name, function (self, args) {
      if (self != null && self.length > MAX_ARR) throw tooLarge("array", MAX_ARR, "elements");
      if (name === "concat") {
        for (var i = 0; i < args.length; i++) {
          if (Array.isArray(args[i]) && args[i].length > MAX_ARR) throw tooLarge("array", MAX_ARR, "elements");
        }
      }
    });
  });
  guardMethod(JSON, "stringify", function (self, args) {
    if (Array.isArray(args[0]) && args[0].length > MAX_ARR) throw tooLarge("array", MAX_ARR, "elements");
  });
  var OriginalArray = guardConstructor("Array", function (args) {
    if (args.length === 1 && typeof args[0] === "number" && args[0] > MAX_ARR) throw tooLarge("array", MAX_ARR, "elements");
  });
  if (OriginalArray) {
    // Array.from({ length: n }) builds n elements from an array-like.
    guardMethod(OriginalArray, "from", function (self, args) {
      var source = args[0];
      if (source !== null && typeof source === "object" && typeof source[Symbol.iterator] !== "function" && Number(source.length) > MAX_ARR) {
        throw tooLarge("array", MAX_ARR, "elements");
      }
    });
  }

  guardConstructor("ArrayBuffer", function (args) {
    if (Number(args[0]) > MAX_BUF) throw tooLarge("buffer", MAX_BUF, "bytes");
  });
  ["Int8Array", "Uint8Array", "Uint8ClampedArray", "Int16Array", "Uint16Array", "Int32Array", "Uint32Array",
   "Float32Array", "Float64Array", "BigInt64Array", "BigUint64Array"].forEach(function (name) {
    var Typed = G[name];
    if (typeof Typed !== "function") return;
    var bytes = Typed.BYTES_PER_ELEMENT;
    guardConstructor(name, function (args) {
      // A number is a length; a buffer, an array or an iterable is already in memory.
      if (typeof args[0] === "number" && args[0] * bytes > MAX_BUF) throw tooLarge("buffer", MAX_BUF, "bytes");
    });
  });
})`

// installGuards runs the prelude in vm with the current limits.
func installGuards(vm *goja.Runtime) error {
	v, err := vm.RunString(guardsJS)
	if err != nil {
		return fmt.Errorf("script guards: %w", err)
	}
	fn, ok := goja.AssertFunction(v)
	if !ok {
		return fmt.Errorf("script guards: the prelude is not a function")
	}
	_, err = fn(goja.Undefined(), vm.GlobalObject(), vm.ToValue(MaxStringChars), vm.ToValue(MaxArrayLength), vm.ToValue(MaxBufferBytes))
	if err != nil {
		return fmt.Errorf("script guards: %w", err)
	}
	return nil
}
