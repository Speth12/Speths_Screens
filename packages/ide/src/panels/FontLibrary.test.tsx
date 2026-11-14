import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useProject } from "../store/projectStore";
import { FontLibrary, MAX_FONT_BYTES, fontFileProblem, fontIdFor } from "./FontLibrary";
import { FontPicker } from "./SettingsEditor";

afterEach(cleanup);
beforeEach(() => useProject.getState().newProject());

describe("a font file", () => {
  it("gets an id from its name that no other font has", () => {
    expect(fontIdFor("Acme Brand-Bold.woff2", [])).toBe("acme-brand-bold");
    expect(fontIdFor("Acme.ttf", ["acme"])).toBe("acme-2");
    expect(fontIdFor("Roboto.ttf", [])).toBe("roboto-2"); // not a bundled font's id
    expect(fontIdFor("###.otf", [])).toBe("font");
  });

  it("must be a font and not too large", () => {
    expect(fontFileProblem("logo.png", 10)).toContain("not a font file");
    expect(fontFileProblem("big.ttf", MAX_FONT_BYTES + 1)).toContain("2 MB at most");
    expect(fontFileProblem("ok.woff2", 50_000)).toBeUndefined();
  });
});

describe("the project's fonts", () => {
  it("adds a file to the project, names it, offers it in the font lists, and removes it", async () => {
    render(<FontLibrary />);
    const file = new File([new Uint8Array([0, 1, 2, 3])], "Acme Brand.woff2");
    fireEvent.change(screen.getByLabelText("Font files"), { target: { files: [file] } });
    await waitFor(() => expect(useProject.getState().project.fonts).toHaveLength(1));
    const font = useProject.getState().project.fonts![0]!;
    expect(font).toMatchObject({ id: "acme-brand", name: "Acme Brand", size: 4 });
    expect(font.dataUrl.startsWith("data:font/woff2;base64,")).toBe(true);

    fireEvent.change(screen.getByLabelText("Name of acme-brand"), { target: { value: "Acme" } });
    expect(useProject.getState().project.fonts![0]!.name).toBe("Acme");

    let chosen: unknown;
    render(<FontPicker f={{ label: "Font" }} value={undefined} put={(v) => { chosen = v; }} />);
    fireEvent.change(screen.getByLabelText("Font"), { target: { value: "acme-brand" } });
    expect(chosen).toBe("acme-brand");
    expect(screen.getByRole("option", { name: "JetBrains Mono" })).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Remove Acme"));
    expect(useProject.getState().project.fonts).toBeUndefined();
  });

  it("says why a file was not added", async () => {
    render(<FontLibrary />);
    fireEvent.change(screen.getByLabelText("Font files"), { target: { files: [new File(["x"], "notes.txt")] } });
    expect((await screen.findByRole("alert")).textContent).toContain("not a font file");
    expect(useProject.getState().project.fonts).toBeUndefined();
  });
});
