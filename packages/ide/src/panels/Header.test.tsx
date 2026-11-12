// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Header } from "./Header";
import { useProject } from "../store/projectStore";
import { useEditorView } from "../store/editorView";
import { useEditorStatus } from "../store/editorStatus";
import { useReach } from "../store/runtimeReach";
import { tagStoreClient } from "../store/tagStoreClient";
import { addTarget, getActiveTarget, loadTargets, resetTargetsForTest, setActiveTarget } from "../store/targetsStore";
import { setToken, clearToken } from "../store/runtimeAuth";

const handlers = { onHelp: vi.fn(), onGallery: vi.fn(), onTheme: vi.fn(), onLanguages: vi.fn(), onToggleJSON: vi.fn(), onPreview: vi.fn() };
const renderHeader = (showJSON = false) => render(<Header {...handlers} showJSON={showJSON} />);

/** Files the page asked the browser to download, by name, with what they held. */
let downloads: { name: string; blob: Blob }[] = [];

const menu = (name: string) => screen.getByRole("button", { name });
const items = () => Array.from(screen.getByRole("menu").querySelectorAll('[role^="menuitem"]')).map((i) => i.textContent);
const open = (name: string) => fireEvent.click(menu(name));
const pick = (menuName: string, item: string | RegExp) => {
  open(menuName);
  fireEvent.click(within(screen.getByRole("menu")).getByText(item));
};

beforeEach(() => {
  Object.values(handlers).forEach((h) => h.mockClear());
  vi.stubGlobal("WebSocket", class { readyState = 0; addEventListener() {} send() {} close() {} });
  vi.stubGlobal("fetch", vi.fn(async () => new Response("[]")));
  downloads = [];
  let last: Blob | null = null;
  URL.createObjectURL = vi.fn((b: Blob | MediaSource) => { last = b as Blob; return "blob:test"; });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push({ name: this.download, blob: last! });
  });
  useEditorStatus.setState({ message: "" });
  useReach.setState({ reachable: true, streaming: false, targetFormat: null });
  useEditorView.setState({ device: "desktop", data: "live" });
  useProject.getState().newProject();
  useProject.getState().loadProject({ ...useProject.getState().project, name: "Pump Station" });
  resetTargetsForTest();
  localStorage.clear();
  clearToken("");
});

/** The program that serves the editor, as far as targets go: it keeps them and answers through its relay. */
function fakeProgram(relayed: (path: string, init?: RequestInit) => Response | undefined = () => undefined) {
  const saved: { id: string; name: string; url: string }[] = [];
  const calls: { url: string; init?: RequestInit }[] = [];
  let n = 0;
  const json = (data: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(data), { status, headers });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, init });
    const method = init?.method ?? "GET";
    const relay = /^\/api\/v1\/targets\/([^/]+)\/relay(\/.*)$/.exec(u);
    if (relay) return relayed(relay[2]!, init) ?? json([], 200, { "X-Speths-Relayed": "1" });
    if (u === "/api/v1/targets" && method === "GET") return json(saved);
    if (u === "/api/v1/targets" && method === "POST") {
      const body = JSON.parse(String(init!.body)) as { name: string; url: string };
      if (!/^https?:\/\//.test(body.url)) return json({ error: "the address must start with http:// or https://" }, 400);
      const t = { id: `id${++n}`, name: body.name, url: body.url.replace(/\/$/, "") };
      saved.push(t);
      return json(t, 201);
    }
    const one = /^\/api\/v1\/targets\/([^/]+)$/.exec(u);
    if (one && method === "DELETE") { saved.splice(saved.findIndex((t) => t.id === one[1]), 1); return json({ ok: true }); }
    return json([]);
  }));
  return { saved, calls };
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  clearToken("");
});

describe("the menu bar", () => {
  it("has File, Edit, View, Project and Help", () => {
    renderHeader();
    const bar = screen.getByRole("menubar", { name: "Main menu" });
    expect(within(bar).getAllByRole("button").map((b) => b.textContent)).toEqual(["File", "Edit", "View", "Project", "Help"]);
  });

  it.each([
    ["File", ["New project…", "Open project file…", "SaveCtrl+S", "Pull from Local (dev)", "Deploy to Local (dev)", "Export HTML snapshot…", "Export Git files…"]],
    ["Edit", ["UndoCtrl+Z", "RedoCtrl+Y", "CopyCtrl+C", "PasteCtrl+V", "DuplicateCtrl+D", "DeleteDel", "Select allCtrl+A", "Bring to frontCtrl+Shift+]", "Bring forwardCtrl+]", "Send backwardCtrl+[", "Send to backCtrl+Shift+["]],
    ["View", ["PreviewF5", "Desktop layout", "Tablet layout", "Phone layout", "Live values", "Demo values", "Project JSON", "Dark look", "Widget gallery…"]],
    ["Project", ["Theme…", "Languages…", "MCP setup…"]],
    ["Help", ["Keyboard shortcuts?"]],
  ])("%s lists its commands", (name, want) => {
    renderHeader();
    open(name);
    expect(items()).toEqual(want);
  });
});

describe("the toolbar", () => {
  it("has the commands used all the time, by name", () => {
    renderHeader();
    for (const name of ["Undo (Ctrl+Z)", "Redo (Ctrl+Y)", "Save to a file (Ctrl+S)", "Manage targets"]) expect(screen.getByRole("button", { name })).toBeTruthy();
    for (const name of ["Preview", "Pull", "Deploy"]) expect(screen.getByRole("button", { name })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Screen size" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Data" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Target" })).toBeTruthy();
  });

  it("Preview, and the commands in the Project and Help menus, call what App gave the header", () => {
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    pick("Project", "Theme…");
    pick("Project", "Languages…");
    pick("View", "Widget gallery…");
    pick("Help", "Keyboard shortcuts");
    pick("View", "Project JSON");
    pick("View", /^Preview/);
    expect(handlers.onPreview).toHaveBeenCalledTimes(2);
    for (const h of [handlers.onTheme, handlers.onLanguages, handlers.onGallery, handlers.onHelp, handlers.onToggleJSON]) expect(h).toHaveBeenCalledTimes(1);
  });

  it("Project JSON is checked while the JSON view is on", () => {
    renderHeader(true);
    open("View");
    expect(screen.getByRole("menuitemcheckbox", { name: "Project JSON" }).getAttribute("aria-checked")).toBe("true");
  });
});

describe("undo and redo", () => {
  it("wait for something to undo, then undo and redo it, from the toolbar and the menu", () => {
    renderHeader();
    const undo = screen.getByRole("button", { name: "Undo (Ctrl+Z)" }) as HTMLButtonElement;
    const redo = screen.getByRole("button", { name: "Redo (Ctrl+Y)" }) as HTMLButtonElement;
    expect(undo.disabled).toBe(true);
    expect(redo.disabled).toBe(true);

    act(() => useProject.getState().addPage("Second"));
    expect(undo.disabled).toBe(false);
    fireEvent.click(undo);
    expect(useProject.getState().project.pages.map((p) => p.name)).not.toContain("Second");
    expect(redo.disabled).toBe(false);
    fireEvent.click(redo);
    expect(useProject.getState().project.pages.map((p) => p.name)).toContain("Second");

    pick("Edit", /^Undo/);
    expect(useProject.getState().project.pages.map((p) => p.name)).not.toContain("Second");
  });

  it("the Edit menu's Undo and Redo are disabled with nothing to undo", () => {
    renderHeader();
    open("Edit");
    expect(screen.getByRole("menuitem", { name: /^Undo/ }).getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByRole("menuitem", { name: /^Redo/ }).getAttribute("aria-disabled")).toBe("true");
  });
});

describe("saving", () => {
  it.each<[string, () => void]>([
    ["the toolbar button", () => fireEvent.click(screen.getByRole("button", { name: "Save to a file (Ctrl+S)" }))],
    ["the File menu", () => pick("File", /^Save/)],
  ])("%s saves <name>.screens.json and says so", async (_, save) => {
    renderHeader();
    save();
    expect(downloads.map((d) => d.name)).toEqual(["Pump-Station.screens.json"]);
    expect(JSON.parse(await downloads[0]!.blob.text())).toMatchObject({ name: "Pump Station" });
    expect(screen.getByText("saved Pump-Station.screens.json")).toBeTruthy();
  });
});

describe("the edit commands press the keys the canvas already handles", () => {
  it.each<[string, string, { key: string; ctrlKey: boolean }]>([
    ["Copy", "Copy", { key: "c", ctrlKey: true }],
    ["Paste", "Paste", { key: "v", ctrlKey: true }],
    ["Duplicate", "Duplicate", { key: "d", ctrlKey: true }],
    ["Delete", "Delete", { key: "Delete", ctrlKey: false }],
    ["Select all", "Select all", { key: "a", ctrlKey: true }],
  ])("%s", (_, item, want) => {
    renderHeader();
    const seen: KeyboardEvent[] = [];
    const on = (e: KeyboardEvent) => seen.push(e);
    window.addEventListener("keydown", on);
    pick("Edit", new RegExp(`^${item}`));
    window.removeEventListener("keydown", on);
    expect(seen.map((e) => ({ key: e.key, ctrlKey: e.ctrlKey }))).toEqual([want]);
  });
});

describe("what is being edited", () => {
  it("the screen size is chosen from the toolbar or the View menu", () => {
    renderHeader();
    fireEvent.click(within(screen.getByRole("group", { name: "Screen size" })).getByRole("button", { name: "Tablet" }));
    expect(useEditorView.getState().device).toBe("tablet");
    pick("View", "Phone layout");
    expect(useEditorView.getState().device).toBe("phone");
    open("View");
    expect(screen.getByRole("menuitemcheckbox", { name: "Phone layout" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("menuitemcheckbox", { name: "Desktop layout" }).getAttribute("aria-checked")).toBe("false");
  });

  it("the data source is chosen from the toolbar or the View menu", () => {
    renderHeader();
    fireEvent.change(screen.getByRole("combobox", { name: "Data" }), { target: { value: "dummy" } });
    expect(useEditorView.getState().data).toBe("dummy");
    pick("View", "Live values");
    expect(useEditorView.getState().data).toBe("live");
  });
});

describe("deploying and pulling", () => {
  const answer = (status: number, body: unknown) => vi.stubGlobal("fetch", vi.fn(async (url: string) => (String(url).endsWith("/api/v1/project") ? new Response(JSON.stringify(body), { status }) : new Response("[]"))));
  const projectCalls = () => vi.mocked(fetch).mock.calls.filter(([u]) => String(u).endsWith("/api/v1/project"));

  it("Deploy posts the project to the target and says what the runtime took", async () => {
    answer(200, { ok: true, datasources: 2, pages: 9 });
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Deploy" }));
    await waitFor(() => expect(screen.getByText("deployed → Local (dev) (2 ds, 9 pg)")).toBeTruthy());
    const [, init] = projectCalls()[0]!;
    expect(init).toMatchObject({ method: "POST" });
    expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({ name: "Pump Station" });
  });

  it("the File menu deploys too, to the target it names", async () => {
    answer(200, { ok: true, datasources: 0, pages: 1 });
    renderHeader();
    pick("File", "Deploy to Local (dev)");
    await waitFor(() => expect(projectCalls()).toHaveLength(1));
  });

  it("says why a deploy failed", async () => {
    answer(400, { ok: false, error: "page \"Main\": unknown setting x" });
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Deploy" }));
    await waitFor(() => expect(screen.getByText("error: page \"Main\": unknown setting x")).toBeTruthy());
  });

  it("a runtime that wants a login gets one, and deploys again after it", async () => {
    let loggedIn = false;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/api/v1/auth/login")) { loggedIn = true; return new Response(JSON.stringify({ token: "t" })); }
      if (u.endsWith("/api/v1/project")) return loggedIn ? new Response(JSON.stringify({ ok: true, datasources: 0, pages: 1 })) : new Response("{}", { status: 401 });
      void init;
      return new Response("[]");
    }));
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Deploy" }));
    const dialog = await screen.findByRole("dialog", { name: "Runtime login" });
    fireEvent.change(within(dialog).getByLabelText("Password"), { target: { value: "secret" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Login & deploy" }));
    await waitFor(() => expect(screen.getByText("deployed → Local (dev) (0 ds, 1 pg)")).toBeTruthy());
    expect(screen.queryByRole("dialog", { name: "Runtime login" })).toBeNull();
  });

  it("a login the runtime refuses says so, and keeps the dialog", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const u = String(url);
      if (u.endsWith("/api/v1/auth/login")) return new Response(JSON.stringify({ error: "wrong password" }), { status: 401 });
      if (u.endsWith("/api/v1/project")) return new Response("{}", { status: 401 });
      return new Response("[]");
    }));
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Deploy" }));
    const dialog = await screen.findByRole("dialog", { name: "Runtime login" });
    fireEvent.change(within(dialog).getByLabelText("Password"), { target: { value: "x" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Login & deploy" }));
    expect((await within(dialog).findByRole("alert")).textContent).toBe("wrong password");
  });

  it("Pull replaces the project with the runtime's", async () => {
    answer(200, { schemaVersion: 6, version: "1.0.0", name: "From the PLC", datasources: [], pages: [{ id: "p", name: "Main", widgets: [] }] });
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Pull" }));
    await waitFor(() => expect(useProject.getState().project.name).toBe("From the PLC"));
    expect(screen.getByText(/opened the project from Local \(dev\)/)).toBeTruthy();
  });

  it("Pull says when the runtime has no project, and when it cannot be reached", async () => {
    answer(200, null);
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Pull" }));
    await waitFor(() => expect(screen.getByText("runtime has no project")).toBeTruthy());
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    fireEvent.click(screen.getByRole("button", { name: "Pull" }));
    await waitFor(() => expect(screen.getByText("pull failed")).toBeTruthy());
  });

  it("Pull and Deploy wait while one of them is running", async () => {
    let finish: (r: Response) => void = () => {};
    vi.stubGlobal("fetch", vi.fn((url: string) => (String(url).endsWith("/api/v1/project") ? new Promise<Response>((res) => { finish = res; }) : Promise.resolve(new Response("[]")))));
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Deploy" }));
    expect((screen.getByRole("button", { name: "Pull" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Deploying…" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => finish(new Response(JSON.stringify({ ok: true, datasources: 0, pages: 1 }))));
    await waitFor(() => expect((screen.getByRole("button", { name: "Pull" }) as HTMLButtonElement).disabled).toBe(false));
  });
});

describe("targets", () => {
  it("the target is chosen from the toolbar, and the File menu names it", async () => {
    fakeProgram();
    const t = await addTarget("Plant A", "http://10.0.0.210:8080");
    renderHeader();
    fireEvent.change(screen.getByRole("combobox", { name: "Target" }), { target: { value: t.id } });
    expect(getActiveTarget().name).toBe("Plant A");
    open("File");
    expect(items()).toContain("Pull from Plant A");
    expect(items()).toContain("Deploy to Plant A");
  });

  it("the dialog adds a target, makes it active and can remove it; the program keeps the list", async () => {
    const { saved } = fakeProgram();
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Manage targets" }));
    const dialog = screen.getByRole("dialog", { name: "Deploy targets" });
    const add = within(dialog).getByRole("button", { name: "Add" }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Plant B" } });
    fireEvent.change(within(dialog).getByLabelText("Address"), { target: { value: "http://10.0.0.5:8080/" } });
    fireEvent.click(add);
    await waitFor(() => expect(getActiveTarget()).toMatchObject({ name: "Plant B", url: "http://10.0.0.5:8080" }));
    expect(saved).toHaveLength(1);
    fireEvent.click(await within(dialog).findByRole("button", { name: "Remove Plant B" }));
    await waitFor(() => expect(getActiveTarget().id).toBe("local"));
    expect(saved).toHaveLength(0);
  });

  it("an address the program refuses is shown as it says it, and nothing is added", async () => {
    const { saved } = fakeProgram();
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Manage targets" }));
    const dialog = screen.getByRole("dialog", { name: "Deploy targets" });
    fireEvent.change(within(dialog).getByLabelText("Address"), { target: { value: "10.0.0.5:8080" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));
    expect((await within(dialog).findByRole("alert")).textContent).toBe("the address must start with http:// or https://");
    expect(saved).toHaveLength(0);
    expect(getActiveTarget().id).toBe("local");
  });

  it("a program with no relay (an older runtime) offers only itself and says why", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (String(url) === "/api/v1/targets" ? new Response("{}", { status: 404 }) : new Response("[]"))));
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Manage targets" }));
    const dialog = screen.getByRole("dialog", { name: "Deploy targets" });
    expect((await within(dialog).findByRole("note")).textContent).toMatch(/cannot pass requests on/);
    expect(within(dialog).queryByRole("button", { name: "Add" })).toBeNull();
  });

  it("targets an earlier version kept in the browser are handed to the program once, and the active one follows", async () => {
    const { saved } = fakeProgram();
    localStorage.setItem("speths-screens-targets-v1", JSON.stringify([{ id: "t-old1", name: "Panel", url: "http://10.0.0.118:8090" }]));
    setActiveTarget("t-old1");
    await loadTargets();
    expect(saved).toEqual([{ id: "id1", name: "Panel", url: "http://10.0.0.118:8090" }]);
    expect(getActiveTarget()).toMatchObject({ id: "id1", name: "Panel" });
    expect(localStorage.getItem("speths-screens-targets-v1")).toBeNull();
    await loadTargets(); // a second load adds nothing
    expect(saved).toHaveLength(1);
  });
});

describe("another runtime is reached through the program that serves the editor", () => {
  const useTarget = async () => {
    const t = await addTarget("Panel", "http://10.0.0.120:8090");
    setActiveTarget(t.id);
    return t;
  };

  it("Deploy goes to the relay for the target, never to the target's own address", async () => {
    const program = fakeProgram((path, init) => (path === "/api/v1/project" && init?.method === "POST" ? new Response(JSON.stringify({ ok: true, datasources: 1, pages: 2 }), { headers: { "X-Speths-Relayed": "1" } }) : undefined));
    const t = await useTarget();
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Deploy" }));
    await waitFor(() => expect(screen.getByText("deployed → Panel (1 ds, 2 pg)")).toBeTruthy());
    expect(program.calls.some((c) => c.url === `/api/v1/targets/${t.id}/relay/api/v1/project` && c.init?.method === "POST")).toBe(true);
    expect(program.calls.some((c) => c.url.includes("10.0.0.120"))).toBe(false);
  });

  it("the target's login goes in its own header, beside this program's", async () => {
    const program = fakeProgram((path) => (path === "/api/v1/project" ? new Response(JSON.stringify({ ok: true, datasources: 0, pages: 1 }), { headers: { "X-Speths-Relayed": "1" } }) : undefined));
    const t = await useTarget();
    setToken("", "OWN");
    setToken(`/api/v1/targets/${t.id}/relay`, "PANEL");
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Deploy" }));
    await waitFor(() => expect(screen.getByText(/deployed → Panel/)).toBeTruthy());
    const sent = program.calls.find((c) => c.url.endsWith("/relay/api/v1/project") && c.init?.method === "POST")!.init!.headers as Record<string, string>;
    expect(sent.Authorization).toBe("Bearer OWN");
    expect(sent["X-Target-Authorization"]).toBe("Bearer PANEL");
  });

  it("says why the target did not answer, in the program's words", async () => {
    fakeProgram((path) => (path === "/api/v1/project" ? new Response(JSON.stringify({ error: "no answer from 10.0.0.120:8090 (timed out)" }), { status: 502 }) : undefined));
    await useTarget();
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Deploy" }));
    await waitFor(() => expect(screen.getByText("error: no answer from 10.0.0.120:8090 (timed out)")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Pull" }));
    await waitFor(() => expect(screen.getByText("pull failed: no answer from 10.0.0.120:8090 (timed out)")).toBeTruthy());
  });

  it("a 401 from the target asks for the target's login; one from this program asks for its own", async () => {
    let fromTarget = true;
    fakeProgram((path) => (path === "/api/v1/project" ? new Response("{}", { status: 401, headers: fromTarget ? { "X-Speths-Relayed": "1" } : {} }) : undefined));
    await useTarget();
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Deploy" }));
    let dialog = await screen.findByRole("dialog", { name: "Runtime login" });
    expect(dialog.textContent).toContain("Panel (http://10.0.0.120:8090)");
    fireEvent.click(within(dialog).getByRole("button", { name: /close/i }));
    fromTarget = false;
    fireEvent.click(screen.getByRole("button", { name: "Deploy" }));
    dialog = await screen.findByRole("dialog", { name: "Runtime login" });
    expect(dialog.textContent).toContain("the runtime that serves this editor");
  });

  it("does not send a project to a runtime that says it reads an older format", async () => {
    const program = fakeProgram((path) => (path === "/api/v1/alive" ? new Response(JSON.stringify({ ok: true, version: "v0.7.0", schemaVersion: 5 }), { headers: { "X-Speths-Relayed": "1" } }) : undefined));
    await useTarget();
    renderHeader();
    await waitFor(() => expect(useReach.getState().targetFormat).toBe(5)); // the header asked the target
    fireEvent.click(screen.getByRole("button", { name: "Deploy" }));
    await waitFor(() => expect(screen.getByText(/not deployed: Panel runs an older Speth's Screens \(it reads project format 5 and this project is format 6\)/)).toBeTruthy());
    expect(program.calls.some((c) => c.url.endsWith("/api/v1/project") && c.init?.method === "POST")).toBe(false);
  });

});

describe("the local target", () => {
  it("the local target cannot be edited or removed", () => {
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Manage targets" }));
    const dialog = screen.getByRole("dialog", { name: "Deploy targets" });
    expect(within(dialog).queryByRole("button", { name: /^Remove Local/ })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: /^Edit Local/ })).toBeNull();
  });
});

describe("what the runtime is doing", () => {
  it("says it is checking until the runtime has answered", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    useReach.setState({ reachable: null, streaming: false });
    renderHeader();
    expect(screen.getByText("Checking…")).toBeTruthy();
  });

  it("says the runtime is ready when it answers, and connected once live values stream", async () => {
    useReach.setState({ reachable: null, streaming: false });
    renderHeader();
    expect(await screen.findByText("Runtime ready")).toBeTruthy();
    cleanup();
    vi.spyOn(tagStoreClient, "isConnected").mockReturnValue(true);
    useReach.setState({ reachable: null, streaming: false });
    renderHeader();
    expect(await screen.findByText("Runtime connected")).toBeTruthy();
  });

  it("says there is no runtime when nothing answers, and treats a login request as an answer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    useReach.setState({ reachable: null, streaming: false });
    renderHeader();
    expect(await screen.findByText("No runtime")).toBeTruthy();
    cleanup();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    useReach.setState({ reachable: null, streaming: false });
    renderHeader();
    expect(await screen.findByText("Runtime ready")).toBeTruthy();
  });
});

describe("opening a new project", () => {
  it("asks what header it should have, and starts it", () => {
    useProject.getState().loadProject({ ...useProject.getState().project, name: "Old" });
    renderHeader();
    pick("File", "New project…");
    const dialog = screen.getByRole("dialog", { name: "New project" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
    expect(useProject.getState().project.name).not.toBe("Old");
  });
});
