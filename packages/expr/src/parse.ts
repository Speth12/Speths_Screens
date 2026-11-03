// Lexer and parser. Mirrors internal/expr/parse.go; both are held to the
// golden cases in testdata/expr, error messages included.
import { FUNCS, type Func } from "./funcs";
import { BinNode, CallNode, CondNode, LitNode, LogicNode, RefNode, UnaryNode, type Node } from "./nodes";

/** Longest expression Compile accepts, in characters (code points). */
export const MAX_LENGTH = 1000;
/** Deepest nesting of parentheses, calls included. */
export const MAX_DEPTH = 32;

export class CompileError extends Error {}

type Kind = "eof" | "num" | "str" | "tag" | "param" | "name" | "punct";
interface Token { kind: Kind; text: string; num: number; col: number }

const isDigit = (c: string) => c >= "0" && c <= "9";
const isHex = (c: string) => isDigit(c) || (c >= "a" && c <= "f") || (c >= "A" && c <= "F");
const isNameStart = (c: string) => c === "_" || (c >= "a" && c <= "z") || (c >= "A" && c <= "Z");
const isNamePart = (c: string) => isNameStart(c) || isDigit(c);
// isParamName reports whether s is a faceplate parameter name: letters, digits and _.
const isParamName = (s: string) => s !== "" && Array.from(s).every(isNamePart);
const TWO = new Set(["&&", "||", "==", "!=", "<=", ">="]);

// lex splits src (one string per code point) into tokens. It fails only on
// broken strings, tag references and numbers; any other stray character
// becomes a punct token, so the parser reports problems in reading order.
function lex(src: string[], params: boolean): Token[] {
  const toks: Token[] = [];
  const tok = (kind: Kind, text: string, col: number, num = 0): Token => ({ kind, text, num, col });
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    const col = i + 1;
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
    } else if (isDigit(c)) {
      const [t, n] = lexNumber(src, i);
      toks.push(t);
      i = n;
    } else if (c === '"' || c === "'") {
      let s = "";
      let j = i + 1;
      for (;;) {
        if (j >= src.length) throw new CompileError(`unclosed string at column ${col}`);
        const d = src[j]!;
        if (d === c) break;
        if (d === "\\") {
          if (j + 1 >= src.length) throw new CompileError(`unclosed string at column ${col}`);
          const e = src[j + 1]!;
          if (e === "\\" || e === '"' || e === "'") s += e;
          else if (e === "n") s += "\n";
          else if (e === "t") s += "\t";
          else throw new CompileError(`unknown escape \\${e} at column ${j + 1}`);
          j += 2;
          continue;
        }
        s += d;
        j++;
      }
      toks.push(tok("str", s, col));
      i = j + 1;
    } else if (c === "{") {
      let j = i + 1;
      while (j < src.length && src[j] !== "}") j++;
      if (j >= src.length) throw new CompileError(`unclosed tag reference at column ${col}`);
      const ref = src.slice(i + 1, j).join("");
      if (params && isParamName(ref)) toks.push(tok("param", ref, col));
      else {
        checkRef(ref, col);
        toks.push(tok("tag", ref, col));
      }
      i = j + 1;
    } else if (isNameStart(c)) {
      let j = i + 1;
      while (j < src.length && isNamePart(src[j]!)) j++;
      toks.push(tok("name", src.slice(i, j).join(""), col));
      i = j;
    } else {
      const two = c + (src[i + 1] ?? "");
      if (TWO.has(two)) {
        toks.push(tok("punct", two, col));
        i += 2;
      } else {
        toks.push(tok("punct", c, col));
        i++;
      }
    }
  }
  toks.push(tok("eof", "", src.length + 1));
  return toks;
}

// lexNumber reads a decimal number (digits, optional fraction and exponent)
// or a 0x hexadecimal integer starting at src[i].
function lexNumber(src: string[], i: number): [Token, number] {
  const col = i + 1;
  const at = (k: number) => src[k] ?? "";
  let j = i;
  if (src[i] === "0" && (at(i + 1) === "x" || at(i + 1) === "X") && isHex(at(i + 2))) {
    j = i + 2;
    while (j < src.length && isHex(src[j]!)) j++;
    const text = src.slice(i, j).join("");
    // BigInt, because parseInt rounds 2^53 + 1 down before the check could see it.
    const v = BigInt("0x" + text.slice(2));
    if (v > 2n ** 53n) throw new CompileError(`number too large at column ${col}`);
    return [{ kind: "num", text, num: Number(v), col }, j];
  }
  while (j < src.length && isDigit(src[j]!)) j++;
  if (at(j) === "." && isDigit(at(j + 1))) {
    j++;
    while (j < src.length && isDigit(src[j]!)) j++;
  }
  if (at(j) === "e" || at(j) === "E") {
    let k = j + 1;
    if (at(k) === "+" || at(k) === "-") k++;
    if (isDigit(at(k))) {
      while (isDigit(at(k))) k++;
      j = k;
    }
  }
  const text = src.slice(i, j).join("");
  const v = Number(text);
  if (!isFinite(v)) throw new CompileError(`number too large at column ${col}`);
  return [{ kind: "num", text, num: v, col }, j];
}

// checkRef checks the text between a tag reference's braces: ns:path or
// datasource:path, where the datasource id is letters, digits, _, - or .
function checkRef(ref: string, col: number) {
  const k = ref.indexOf(":");
  const ds = k < 0 ? "" : ref.slice(0, k);
  if (k < 0 || ds === "" || !Array.from(ds).every((c) => isNamePart(c) || c === "-" || c === ".")) {
    throw new CompileError(`not a tag: {${ref}} (tags are written {ns:path} or {datasource:path}) at column ${col}`);
  }
  if (ref.slice(k + 1) === "") throw new CompileError(`empty tag path at column ${col}`);
}

function unexpected(t: Token): CompileError {
  if (t.kind === "eof") return new CompileError("unexpected end of expression");
  if (t.kind === "str") return new CompileError(`unexpected string at column ${t.col}`);
  if (t.kind === "tag" || t.kind === "param") return new CompileError(`unexpected tag {${t.text}} at column ${t.col}`);
  return new CompileError(`unexpected "${t.text}" at column ${t.col}`);
}

const CMP = new Set(["==", "!=", "<", "<=", ">", ">="]);
const isCmp = (t: Token) => t.kind === "punct" && CMP.has(t.text);

export interface Parsed { root: Node; refs: string[]; params: string[]; usesValue: boolean }

class Parser {
  private pos = 0;
  private depth = 0;
  readonly refs: string[] = [];
  readonly params: string[] = [];
  usesValue = false;

  constructor(private readonly toks: Token[]) {}

  peek(): Token { return this.toks[this.pos]!; }

  private next(): Token {
    const t = this.toks[this.pos]!;
    if (t.kind !== "eof") this.pos++;
    return t;
  }

  private is(text: string): boolean {
    const t = this.peek();
    return t.kind === "punct" && t.text === text;
  }

  private expect(text: string) {
    if (!this.is(text)) throw unexpected(this.peek());
    this.next();
  }

  parseExpr(): Node {
    const c = this.parseOr();
    if (!this.is("?")) return c;
    this.next();
    const a = this.parseExpr();
    this.expect(":");
    const b = this.parseExpr();
    return new CondNode(c, a, b);
  }

  private parseOr(): Node {
    let l = this.parseAnd();
    while (this.is("||")) {
      this.next();
      l = new LogicNode(true, l, this.parseAnd());
    }
    return l;
  }

  private parseAnd(): Node {
    let l = this.parseCmp();
    while (this.is("&&")) {
      this.next();
      l = new LogicNode(false, l, this.parseCmp());
    }
    return l;
  }

  private parseCmp(): Node {
    const l = this.parseSum();
    if (!isCmp(this.peek())) return l;
    const op = this.next().text;
    const r = this.parseSum();
    const t = this.peek();
    if (isCmp(t)) throw new CompileError(`comparisons cannot be chained at column ${t.col}`);
    return new BinNode(op, l, r);
  }

  private parseSum(): Node {
    let l = this.parseProduct();
    while (this.is("+") || this.is("-")) {
      const op = this.next().text;
      l = new BinNode(op, l, this.parseProduct());
    }
    return l;
  }

  private parseProduct(): Node {
    let l = this.parseUnary();
    while (this.is("*") || this.is("/") || this.is("%")) {
      const op = this.next().text;
      l = new BinNode(op, l, this.parseUnary());
    }
    return l;
  }

  private parseUnary(): Node {
    if (this.is("!") || this.is("-")) {
      const op = this.next().text;
      return new UnaryNode(op, this.parseUnary());
    }
    return this.parsePrimary();
  }

  // open enters a parenthesis at column col.
  private open(col: number) {
    this.depth++;
    if (this.depth > MAX_DEPTH) throw new CompileError(`nested deeper than ${MAX_DEPTH} levels at column ${col}`);
  }

  private parsePrimary(): Node {
    const t = this.next();
    switch (t.kind) {
      case "num":
        return new LitNode(t.num);
      case "str":
        return new LitNode(t.text);
      case "param":
        if (!this.params.includes(t.text)) this.params.push(t.text);
        return new RefNode(t.text, false);
      case "tag":
        if (!this.refs.includes(t.text)) this.refs.push(t.text);
        return new RefNode(t.text, false);
      case "name": {
        if (t.text === "true") return new LitNode(true);
        if (t.text === "false") return new LitNode(false);
        if (t.text === "value") {
          this.usesValue = true;
          return new RefNode("", true);
        }
        const fn: Func | undefined = Object.prototype.hasOwnProperty.call(FUNCS, t.text) ? FUNCS[t.text] : undefined;
        if (!this.is("(")) {
          if (fn) throw new CompileError(`${t.text} must be called, like ${t.text}(x) at column ${t.col}`);
          throw new CompileError(`unknown name ${t.text} (tags are written {ns:path}) at column ${t.col}`);
        }
        if (!fn) throw new CompileError(`unknown function ${t.text} at column ${t.col}`);
        this.open(this.next().col);
        const args: Node[] = [];
        if (!this.is(")")) {
          for (;;) {
            args.push(this.parseExpr());
            if (!this.is(",")) break;
            this.next();
          }
        }
        this.expect(")");
        this.depth--;
        const problem = checkCall(t.text, fn, args);
        if (problem) throw new CompileError(`${problem} at column ${t.col}`);
        return new CallNode(t.text, fn, args);
      }
      case "punct":
        if (t.text === "(") {
          this.open(t.col);
          const x = this.parseExpr();
          this.expect(")");
          this.depth--;
          return x;
        }
    }
    throw unexpected(t);
  }
}

// checkCall checks the argument count (and, for good, that the argument is
// a tag) at compile time.
function checkCall(name: string, fn: Func, args: Node[]): string | undefined {
  if (fn.tag) {
    if (args.length !== 1 || !(args[0] instanceof RefNode)) return `${name} takes a tag, like ${name}({ns:path})`;
    return undefined;
  }
  const n = args.length;
  if (n >= fn.min && (fn.max < 0 || n <= fn.max)) return undefined;
  const plural = (k: number) => (k === 1 ? "argument" : "arguments");
  if (fn.max < 0) return `${name} takes at least ${fn.min} ${plural(fn.min)}, got ${n}`;
  if (fn.min === fn.max) return `${name} takes ${fn.min} ${plural(fn.min)}, got ${n}`;
  return `${name} takes ${fn.min} or ${fn.max} arguments, got ${n}`;
}

/** Parses src, throwing CompileError. With params, {name} is a faceplate parameter. */
export function parse(src: string, params = false): Parsed {
  const chars = Array.from(src);
  if (chars.length > MAX_LENGTH) throw new CompileError(`expression longer than ${MAX_LENGTH} characters`);
  if (chars.every((c) => c === " " || c === "\t" || c === "\n" || c === "\r")) throw new CompileError("empty expression");
  const p = new Parser(lex(chars, params));
  const root = p.parseExpr();
  const t = p.peek();
  if (t.kind !== "eof") throw unexpected(t);
  return { root, refs: p.refs, params: p.params, usesValue: p.usesValue };
}
