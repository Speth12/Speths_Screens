import { expect, it } from "vitest";
import { createProjectSync } from "./projectSync";

const body = (name: string) => JSON.stringify({ schemaVersion: 7, version: "1", name, datasources: [], pages: [{ id: "p", name: "Main", widgets: [] }] });

it("the first poll is a change and the same body again is not", () => {
  const sync = createProjectSync();
  const first = sync.accept(body("A"));
  expect(first.kind).toBe("changed");
  expect(sync.accept(body("A"))).toEqual({ kind: "same" });
  expect(sync.accept(body("A"))).toEqual({ kind: "same" });
});

it("a different project is a change, and going back to the first is one too", () => {
  const sync = createProjectSync();
  sync.accept(body("A"));
  const b = sync.accept(body("B"));
  expect(b.kind === "changed" && b.project.name).toBe("B");
  expect(sync.accept(body("A")).kind).toBe("changed");
});

it("an answer without pages means no project, and the next real one is a change", () => {
  const sync = createProjectSync();
  sync.accept(body("A"));
  expect(sync.accept(JSON.stringify({ error: "no project" })).kind).toBe("none");
  expect(sync.accept("null").kind).toBe("none");
  expect(sync.accept(body("A")).kind).toBe("changed");
});

it("reset makes the same body a change again", () => {
  const sync = createProjectSync();
  sync.accept(body("A"));
  sync.reset();
  expect(sync.accept(body("A")).kind).toBe("changed");
});

it("a body that is not JSON throws and leaves the last project in place", () => {
  const sync = createProjectSync();
  sync.accept(body("A"));
  expect(() => sync.accept("<html>")).toThrow();
  expect(sync.accept(body("A"))).toEqual({ kind: "same" });
});
