import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CertPinModal, needsCertPin } from "./CertCheck";
import { AddDatasourceModal } from "./LeftPanel";
import type { Datasource } from "@speths-screens/shared-types";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const FP = "AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89";

function stubTest(status: object) {
  const f = vi.fn(async () => new Response(JSON.stringify(status)));
  vi.stubGlobal("fetch", f);
  const bodies = () => (f.mock.calls as unknown as [string, RequestInit][])
    .filter(([u]) => u.endsWith("/api/v1/datasources/test"))
    .map(([, init]) => JSON.parse(String(init.body)));
  return bodies;
}

describe("needsCertPin", () => {
  const cases: { name: string; ds: Pick<Datasource, "type" | "config">; want: boolean }[] = [
    { name: "REST https, unset", ds: { type: "rest", config: { endpoint: "https://10.0.0.210" } }, want: true },
    { name: "REST https, pinned", ds: { type: "rest", config: { endpoint: "https://10.0.0.210", certCheck: "pinned" } }, want: false },
    { name: "REST http", ds: { type: "rest", config: { endpoint: "http://10.0.0.210" } }, want: false },
    { name: "MQTT ssl, unset (trusted roots)", ds: { type: "mqtt", config: { endpoint: "ssl://b:8883" } }, want: false },
    { name: "MQTT ssl, off", ds: { type: "mqtt", config: { endpoint: "ssl://b:8883", certCheck: "off" } }, want: true },
    { name: "OPC UA None", ds: { type: "opcua", config: { endpoint: "opc.tcp://p:4840", securityMode: "None" } }, want: false },
    { name: "OPC UA secure, unset", ds: { type: "opcua", config: { endpoint: "opc.tcp://p:4840", securityMode: "Sign" } }, want: true },
  ];
  for (const c of cases) it(c.name, () => expect(needsCertPin(c.ds)).toBe(c.want));
});

describe("CertPinModal", () => {
  const ds: Datasource = { id: "rest", label: "PLC REST", type: "rest", config: { endpoint: "https://10.0.0.210", password: "kept", certFingerprint: "OLD" } };

  it("reads the device's certificate without a pin and pins it", async () => {
    const bodies = stubTest({ connected: false, lastError: "certificate not pinned yet", certFingerprint: FP });
    const onPin = vi.fn();
    render(<CertPinModal ds={ds} onPin={onPin} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByLabelText("Device fingerprint").textContent).toBe(FP));
    const sent = bodies()[0];
    expect(sent.config.certCheck).toBe("pinned");
    expect(sent.config.certFingerprint).toBeUndefined();
    expect(sent.config.endpoint).toBe("https://10.0.0.210");
    fireEvent.click(screen.getByText("Pin this certificate"));
    expect(onPin).toHaveBeenCalledWith(FP);
  });

  it("shows why the certificate could not be read", async () => {
    stubTest({ connected: false, lastError: "no answer from 10.0.0.210 (timed out)" });
    render(<CertPinModal ds={ds} onPin={() => {}} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/no answer from 10.0.0.210/)).toBeTruthy());
    expect((screen.getByText("Pin this certificate") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("AddDatasourceModal", () => {
  it("pins the device's certificate after a test", async () => {
    const bodies = stubTest({ connected: false, lastError: "certificate not pinned yet", certFingerprint: FP });
    const onAdd = vi.fn();
    render(<AddDatasourceModal onClose={() => {}} onAdd={onAdd} />);
    expect((screen.getByLabelText("Server certificate") as HTMLSelectElement).value).toBe("pinned");

    fireEvent.click(screen.getByText("Test"));
    await waitFor(() => expect(screen.getByText("Pin")).toBeTruthy());
    expect(bodies()[0].config.certCheck).toBe("pinned");
    fireEvent.click(screen.getByText("Pin"));
    expect((screen.getByLabelText("Certificate fingerprint") as HTMLInputElement).value).toBe(FP);

    fireEvent.click(screen.getByText("Add"));
    const added = onAdd.mock.calls[0]![0];
    expect(added.config).toMatchObject({ endpoint: "https://10.0.0.210", certCheck: "pinned", certFingerprint: FP });
  });

  it("OPC UA without security has no certificate setting", () => {
    stubTest({ connected: true });
    render(<AddDatasourceModal onClose={() => {}} onAdd={() => {}} />);
    fireEvent.change(screen.getAllByRole("combobox")[0]!, { target: { value: "opcua" } });
    expect(screen.queryByLabelText("Server certificate")).toBeNull();
  });
});
