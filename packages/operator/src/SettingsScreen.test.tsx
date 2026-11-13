// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SettingsScreen, type SettingsProps } from "./SettingsScreen";

afterEach(cleanup);

const props = (more: Partial<SettingsProps> = {}): SettingsProps => ({ mode: "", onMode: vi.fn(), onLanguage: vi.fn(), ...more });

describe("SettingsScreen", () => {
  it("light or dark acts", () => {
    const p = props();
    render(<SettingsScreen {...p} />);
    fireEvent.change(screen.getByLabelText("Light or dark"), { target: { value: "dark" } });
    expect(p.onMode).toHaveBeenCalledWith("dark");
  });

  it("offers a language only from two languages, and acts", () => {
    render(<SettingsScreen {...props()} />);
    expect(screen.queryByLabelText("Language")).toBeNull();
    cleanup();
    const p = props({ languages: ["en", "de"], language: "en" });
    render(<SettingsScreen {...p} />);
    fireEvent.change(screen.getByLabelText("Language"), { target: { value: "de" } });
    expect(p.onLanguage).toHaveBeenCalledWith("de");
  });

  it("offers fit only where it applies", () => {
    render(<SettingsScreen {...props()} />);
    expect(screen.queryByLabelText("Fit the page to the window")).toBeNull();
    cleanup();
    const toggle = vi.fn();
    render(<SettingsScreen {...props({ fit: { on: false, toggle } })} />);
    fireEvent.click(screen.getByLabelText("Fit the page to the window"));
    expect(toggle).toHaveBeenCalled();
  });

  it("recipes are not here (the recipes widget has them); Log out only when the project asks for logins", () => {
    render(<SettingsScreen {...props()} />);
    expect(screen.queryByText("Recipes")).toBeNull();
    expect(screen.queryByText("Log out")).toBeNull();
    expect(screen.queryByText("Lock screen")).toBeNull(); // the PIN lock is gone (format 7)
    cleanup();
    const onLogout = vi.fn();
    render(<SettingsScreen {...props({ onLogout })} />);
    fireEvent.click(screen.getByText("Log out"));
    expect(onLogout).toHaveBeenCalled();
  });

  it("writes its text in the language being shown", () => {
    render(<SettingsScreen {...props({ t: (s) => (s === "Settings" ? "Einstellungen" : s) })} />);
    expect(screen.getByText("Einstellungen")).toBeTruthy();
  });
});
