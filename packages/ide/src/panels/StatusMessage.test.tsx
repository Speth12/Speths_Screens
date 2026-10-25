import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StatusMessage, messageParts } from "./StatusMessage";

afterEach(cleanup);

describe("messageParts", () => {
  it.each([
    ["plain", "pulled from Local", ["pulled from Local"]],
    ["one problem", "not deployed: page \"Main\", widget w1 (gauge): unknown setting x", ["not deployed: page \"Main\", widget w1 (gauge): unknown setting x"]],
    ["problems", "not deployed: a; b; c", ["not deployed", "a", "b", "c"]],
    ["upgrade notes", "opened plant.json, upgraded (2 changes: a: x; b: y)", ["opened plant.json, upgraded", "a: x", "b: y"]],
    ["could not open", "could not open x.json: a; b", ["could not open x.json", "a", "b"]],
  ])("%s", (_, text, want) => {
    expect(messageParts(text)).toEqual(want);
  });
});

describe("StatusMessage", () => {
  it("shows a short message as it is, with the whole text on hover", () => {
    render(<StatusMessage text="pulled from Local" />);
    expect(screen.getByTitle("pulled from Local").textContent).toBe("pulled from Local");
  });

  it("opens a long message as a list", () => {
    const text = `not deployed: page "Main", widget a (gauge): unknown setting x; page "Main", widget b (led): unknown setting y`;
    render(<StatusMessage text={text} />);
    const line = screen.getByTitle(text);
    expect(line.textContent).toBe("not deployed (2)");
    fireEvent.click(line);
    const items = screen.getByRole("dialog").querySelectorAll("li");
    expect(Array.from(items).map((li) => li.textContent)).toEqual([
      `page "Main", widget a (gauge): unknown setting x`,
      `page "Main", widget b (led): unknown setting y`,
    ]);
  });
});
