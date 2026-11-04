// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { useElementSize } from "./useElementSize";

let callbacks: Array<(entries: unknown[]) => void> = [];
let observed: unknown[] = [];
let disconnected = 0;

beforeEach(() => {
  callbacks = []; observed = []; disconnected = 0;
  vi.stubGlobal("ResizeObserver", class {
    constructor(cb: (entries: unknown[]) => void) { callbacks.push(cb); }
    observe(el: unknown) { observed.push(el); }
    disconnect() { disconnected++; }
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const resize = (width: number, height: number) => act(() => callbacks.at(-1)!([{ contentRect: { width, height } }]));

function Probe({ ready }: { ready: boolean }) {
  const [ref, size] = useElementSize();
  // Like the operator: a loading screen first, the measured element later.
  return ready ? <div ref={ref} data-testid="box">{size.width}x{size.height}</div> : <p>loading</p>;
}

it("measures an element that appears after the first render", () => {
  const { rerender } = render(<Probe ready={false} />);
  expect(observed).toHaveLength(0);
  rerender(<Probe ready />);
  expect(observed).toEqual([screen.getByTestId("box")]);
  expect(screen.getByTestId("box").textContent).toBe("0x0");
  resize(800, 600);
  expect(screen.getByTestId("box").textContent).toBe("800x600");
  resize(1024, 500);
  expect(screen.getByTestId("box").textContent).toBe("1024x500");
});

it("stops observing when the element goes away", () => {
  const { rerender } = render(<Probe ready />);
  rerender(<Probe ready={false} />);
  expect(disconnected).toBe(1);
});
