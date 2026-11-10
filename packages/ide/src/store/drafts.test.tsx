// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { isDirty, useDraft, useDrafts } from "./drafts";

beforeEach(() => useDrafts.setState({ entries: {} }));
afterEach(cleanup);

type Rule = { name: string };
const draft = (key: string, stored: Rule) => renderHook((p: { key: string; stored: Rule }) => useDraft(p.key, p.stored), { initialProps: { key, stored } });

describe("useDraft", () => {
  it("shows what is stored until something is changed", () => {
    const h = draft("a", { name: "High" });
    expect(h.result.current.value).toEqual({ name: "High" });
    expect(h.result.current.dirty).toBe(false);
  });

  it("holds a change apart from what is stored, and Revert gives it up", () => {
    const h = draft("a", { name: "High" });
    act(() => h.result.current.set({ name: "Higher" }));
    expect(h.result.current.value).toEqual({ name: "Higher" });
    expect(h.result.current.dirty).toBe(true);
    act(() => h.result.current.revert());
    expect(h.result.current.value).toEqual({ name: "High" });
    expect(h.result.current.dirty).toBe(false);
  });

  it("a change back to what is stored is no change", () => {
    const h = draft("a", { name: "High" });
    act(() => h.result.current.set({ name: "x" }));
    act(() => h.result.current.set({ name: "High" }));
    expect(h.result.current.dirty).toBe(false);
    expect(useDrafts.getState().entries).toEqual({});
  });

  it("a function change gets the latest draft, even from a handler kept from an earlier render", () => {
    const h = draft("a", { name: "" });
    const set = h.result.current.set; // as a drag handler would hold it
    act(() => set((d) => ({ name: `${d.name}a` })));
    act(() => set((d) => ({ name: `${d.name}b` })));
    expect(h.result.current.value).toEqual({ name: "ab" });
  });

  it("survives the tab being unmounted and mounted again", () => {
    const first = draft("a", { name: "High" });
    act(() => first.result.current.set({ name: "Edited" }));
    first.unmount();
    const second = draft("a", { name: "High" });
    expect(second.result.current.value).toEqual({ name: "Edited" });
    expect(second.result.current.dirty).toBe(true);
  });

  it("is not shown once what it was made from has changed", () => {
    const h = draft("a", { name: "High" });
    act(() => h.result.current.set({ name: "Edited" }));
    h.rerender({ key: "a", stored: { name: "Changed elsewhere" } });
    expect(h.result.current.value).toEqual({ name: "Changed elsewhere" });
    expect(h.result.current.dirty).toBe(false);
  });

  it("keeps one draft per key", () => {
    const a = draft("a", { name: "A" });
    const b = draft("b", { name: "B" });
    act(() => a.result.current.set({ name: "A2" }));
    expect(b.result.current.value).toEqual({ name: "B" });
    expect(isDirty(useDrafts.getState().entries, "a", { name: "A" })).toBe(true);
    expect(isDirty(useDrafts.getState().entries, "b", { name: "B" })).toBe(false);
  });

  it("another key's draft does not follow a change of key", () => {
    const h = draft("a", { name: "A" });
    act(() => h.result.current.set({ name: "A2" }));
    h.rerender({ key: "b", stored: { name: "B" } });
    expect(h.result.current.value).toEqual({ name: "B" });
    act(() => h.result.current.set({ name: "B2" }));
    h.rerender({ key: "a", stored: { name: "A" } });
    expect(h.result.current.value).toEqual({ name: "A2" });
  });
});

describe("isDirty", () => {
  it.each([
    ["no draft", {}, false],
    ["a draft made from what is stored", { k: { base: JSON.stringify({ n: 1 }), value: { n: 2 } } }, true],
    ["a draft made from something else", { k: { base: JSON.stringify({ n: 0 }), value: { n: 2 } } }, false],
  ])("%s", (_, entries, want) => expect(isDirty(entries, "k", { n: 1 })).toBe(want));
});
