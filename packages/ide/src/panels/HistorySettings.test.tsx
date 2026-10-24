import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HistorySettings, cleanHistorian } from "./HistorySettings";
import type { HistorianSettings } from "@speths-screens/shared-types";

afterEach(cleanup);

describe("cleanHistorian", () => {
  const cases: { name: string; in: HistorianSettings; want: HistorianSettings | undefined }[] = [
    { name: "empty is the runtime default", in: {}, want: undefined },
    { name: "zero deadband and no tags", in: { deadband: 0, tags: [] }, want: undefined },
    { name: "keeps what is set", in: { deadband: 0.5, retentionDays: 30, tags: [{ path: "plc:A*" }] }, want: { deadband: 0.5, retentionDays: 30, tags: [{ path: "plc:A*" }] } },
  ];
  for (const c of cases) it(c.name, () => expect(cleanHistorian(c.in)).toEqual(c.want));
});

describe("HistorySettings", () => {
  const setup = (value: HistorianSettings | undefined) => {
    const onChange = vi.fn();
    render(<HistorySettings value={value} onChange={onChange} />);
    return onChange;
  };

  it("sets the default deadband and the days kept", () => {
    const onChange = setup(undefined);
    fireEvent.change(screen.getByLabelText("Default deadband"), { target: { value: "0.5" } });
    expect(onChange).toHaveBeenLastCalledWith({ deadband: 0.5 });
    fireEvent.change(screen.getByLabelText("Days kept"), { target: { value: "30" } });
    expect(onChange).toHaveBeenLastCalledWith({ retentionDays: 30 });
  });

  it("clearing the last setting returns to the runtime defaults", () => {
    const onChange = setup({ deadband: 0.5 });
    fireEvent.change(screen.getByLabelText("Default deadband"), { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it("edits, skips and removes tag rules", () => {
    const onChange = setup({ tags: [{ path: "plc:Diag*" }, { path: "plc:Temp" }] });
    fireEvent.change(screen.getByLabelText("Rule 2 deadband"), { target: { value: "0.2" } });
    expect(onChange).toHaveBeenLastCalledWith({ tags: [{ path: "plc:Diag*" }, { path: "plc:Temp", deadband: 0.2 }] });
    fireEvent.click(screen.getByLabelText("Rule 1 store"));
    expect(onChange).toHaveBeenLastCalledWith({ tags: [{ path: "plc:Diag*", store: false }, { path: "plc:Temp" }] });
    fireEvent.click(screen.getByLabelText("Remove rule 1"));
    expect(onChange).toHaveBeenLastCalledWith({ tags: [{ path: "plc:Temp" }] });
  });

  it("adds an empty rule", () => {
    const onChange = setup(undefined);
    fireEvent.click(screen.getByText("+ tag rule"));
    expect(onChange).toHaveBeenLastCalledWith({ tags: [{ path: "" }] });
  });
});
