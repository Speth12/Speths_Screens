import { createContext, useContext } from "react";

export type AlarmEvent = {
  id: string;
  ruleName: string;
  severity: "critical" | "warning" | "info";
  message: string;
  binding: string;
  value: number;
  active: boolean;
  acked: boolean;
  triggeredAt: string;
};

export type AckFn = (eventId: string) => void;

export const AlarmContext = createContext<{ alarms: AlarmEvent[]; ack: AckFn }>({
  alarms: [],
  ack: () => {},
});

export function useAlarms() {
  return useContext(AlarmContext);
}
