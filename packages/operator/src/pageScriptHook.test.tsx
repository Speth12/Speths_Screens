// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { PageHost } from "@speths-screens/script-api";

const started: Array<{ script: string; host: PageHost; stop: ReturnType<typeof vi.fn> }> = [];
vi.mock("@speths-screens/script-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@speths-screens/script-api")>()),
  startPageScript: (script: string, host: PageHost) => {
    const stop = vi.fn();
    started.push({ script, host, stop });
    return stop;
  },
}));

const { usePageScript } = await import("./pageScript");

afterEach(() => {
  cleanup();
  started.length = 0;
});

function Page({ id, script, navigate }: { id: string; script: string; navigate: (page: string) => void }) {
  usePageScript(id, script, navigate);
  return null;
}

it("a new navigate function does not restart the page script", () => {
  const { rerender } = render(<Page id="main" script="log(1)" navigate={() => {}} />);
  // The app fetches the project every 5 s, which gives it a new navigate function each time.
  rerender(<Page id="main" script="log(1)" navigate={() => {}} />);
  rerender(<Page id="main" script="log(1)" navigate={() => {}} />);
  expect(started).toHaveLength(1);
  expect(started[0]!.stop).not.toHaveBeenCalled();
});

it("the script's navigate calls the latest navigate function", () => {
  const first = vi.fn();
  const second = vi.fn();
  const { rerender } = render(<Page id="main" script="log(1)" navigate={first} />);
  rerender(<Page id="main" script="log(1)" navigate={second} />);
  started[0]!.host.navigate("Loop");
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledWith("Loop");
});

it("another page or another script restarts it, and closing the page stops it", () => {
  const nav = () => {};
  const { rerender, unmount } = render(<Page id="main" script="log(1)" navigate={nav} />);
  rerender(<Page id="other" script="log(1)" navigate={nav} />);
  expect(started).toHaveLength(2);
  expect(started[0]!.stop).toHaveBeenCalledTimes(1);
  rerender(<Page id="other" script="log(2)" navigate={nav} />);
  expect(started).toHaveLength(3);
  unmount();
  expect(started[2]!.stop).toHaveBeenCalledTimes(1);
});

it("a page without a script starts nothing", () => {
  render(<Page id="main" script="   " navigate={() => {}} />);
  expect(started).toHaveLength(0);
});
