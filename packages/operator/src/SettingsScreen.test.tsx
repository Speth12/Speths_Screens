// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SettingsScreen, type SettingsProps } from "./SettingsScreen";

afterEach(cleanup);

const props = (more: Partial<SettingsProps> = {}): SettingsProps => ({ mode: "", onMode: vi.fn(), onLanguage: vi.fn(), onRecipes: vi.fn(), ...more });

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

  it("Recipes opens the recipes; Lock screen only with a PIN", () => {
    const p = props();
    render(<SettingsScreen {...p} />);
    fireEvent.click(screen.getByText("Recipes"));
    expect(p.onRecipes).toHaveBeenCalled();
    expect(screen.queryByText("Lock screen")).toBeNull();
    cleanup();
    const onLock = vi.fn();
    render(<SettingsScreen {...props({ onLock })} />);
    fireEvent.click(screen.getByText("Lock screen"));
    expect(onLock).toHaveBeenCalled();
  });

  it("writes its text in the language being shown", () => {
    render(<SettingsScreen {...props({ t: (s) => (s === "Settings" ? "Einstellungen" : s) })} />);
    expect(screen.getByText("Einstellungen")).toBeTruthy();
  });
});
