import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MCPModal } from "./MCPModal";

afterEach(cleanup);

describe("MCPModal", () => {
  it("tells a client to add the server as speths-screens, and lists only speths-screens:// resources", () => {
    const { container } = render(<MCPModal onClose={() => {}} />);
    const text = container.textContent ?? "";
    expect(text).toContain("claude mcp add --transport http speths-screens ");
    expect(text).toContain('"speths-screens"');
    expect(text).not.toMatch(/x-hmi|xhmi/);
    fireEvent.click(screen.getByRole("button", { name: /tools/i }));
    expect(container.textContent).toContain("speths-screens://project");
    expect(container.textContent).not.toMatch(/x-hmi|xhmi/);
  });
});
