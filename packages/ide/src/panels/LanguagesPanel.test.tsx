import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useProject, type Project } from "../store/projectStore";
import { useEditorView } from "../store/editorView";
import { LanguagesPanel } from "./LanguagesPanel";

afterEach(cleanup);

const project = (more: Partial<Project> = {}): Project => ({
  schemaVersion: 7, version: "1", datasources: [],
  pages: [{ id: "p1", name: "Overview", widgets: [{ id: "w1", type: "numericDisplay", x: 0, y: 0, w: 2, h: 2, props: { label: "Pressure" } } as never] }],
  ...more,
});
const state = () => useProject.getState().project;

beforeEach(() => { useProject.getState().loadProject(project()); useEditorView.getState().setLanguage(null); });

describe("LanguagesPanel", () => {
  it("adds a language, and the first one added is the language the text is written in", () => {
    render(<LanguagesPanel onClose={() => {}} />);
    const add = (code: string) => {
      fireEvent.change(screen.getByLabelText("New language code"), { target: { value: code } });
      fireEvent.click(screen.getByText("Add language"));
    };
    add("en"); add("de");
    expect(state().languages).toEqual(["en", "de"]);
  });

  it("refuses a code that is not a language code, or one already there", () => {
    useProject.getState().setLanguages(["en"]);
    render(<LanguagesPanel onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("New language code"), { target: { value: "German" } });
    expect(screen.getByText("Use a language code such as en, de or es.")).toBeTruthy();
    expect((screen.getByText("Add language") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("New language code"), { target: { value: "en" } });
    expect(screen.getByText("Already added.")).toBeTruthy();
  });

  it("lists the project's texts and keeps a translation, and clearing it removes it", () => {
    useProject.getState().setLanguages(["en", "de"]);
    render(<LanguagesPanel onClose={() => {}} />);
    expect(screen.getByText("Overview")).toBeTruthy();
    expect(screen.getByText("0 of 2 done")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("de for Pressure"), { target: { value: "Druck" } });
    expect(state().translations).toEqual({ de: { Pressure: "Druck" } });
    expect(screen.getByText("1 of 2 done")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("de for Pressure"), { target: { value: "" } });
    expect(state().translations).toBeUndefined();
  });

  it("removing a language drops its translations; removing all drops both fields", () => {
    useProject.getState().setLanguages(["en", "de", "es"]);
    useProject.getState().setTranslation("de", "Pressure", "Druck");
    useProject.getState().setTranslation("es", "Pressure", "Presión");
    render(<LanguagesPanel onClose={() => {}} />);
    fireEvent.click(screen.getByLabelText("Remove de"));
    expect(state().languages).toEqual(["en", "es"]);
    expect(state().translations).toEqual({ es: { Pressure: "Presión" } });
    useProject.getState().setLanguages([]);
    expect(state().languages).toBeUndefined();
    expect(state().translations).toBeUndefined();
  });

  it("the preview language is the editor's own and is not saved in the project", () => {
    useProject.getState().setLanguages(["en", "de"]);
    render(<LanguagesPanel onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Preview language"), { target: { value: "de" } });
    expect(useEditorView.getState().language).toBe("de");
    expect(JSON.stringify(state())).not.toContain('"language"');
  });
});
