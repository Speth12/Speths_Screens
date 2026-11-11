// What to tell a person when the IDE cannot reach the runtime it is pointed at. A browser reports a refused
// connection, a wrong address and a runtime that does not accept this IDE's address (CORS) the same way, as
// "Failed to fetch", so the message lists what to check.

/** Whether a failed fetch was a network or cross-origin failure, as opposed to an answer the runtime gave. */
export const isNetworkFailure = (e: unknown): boolean => e instanceof TypeError;

/** The words for a failed request to `targetUrl` ("" is the runtime this page came from). */
export function describeFailure(targetUrl: string, e: unknown, origin: string = location.origin): string {
  const message = e instanceof Error ? e.message : String(e);
  if (!isNetworkFailure(e) || !targetUrl) return message;
  return `cannot reach ${targetUrl} (${message}). Check the address, that the runtime is running and listening on the network, and that it accepts this IDE: start it with --cors-origins=${origin} (on the panel: SPETHS_CORS=${origin} with install-service.sh).`;
}
