// What to tell a person when a request from the IDE fails before any runtime answered. The browser only talks to
// the program that served this page (which passes requests on to other runtimes and reports why one did not
// answer), so a failed fetch means that program itself is not reachable.

/** Whether a failed fetch was a network failure, as opposed to an answer a runtime gave. */
export const isNetworkFailure = (e: unknown): boolean => e instanceof TypeError;

/** The words for a failed request. */
export function describeFailure(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  if (!isNetworkFailure(e)) return message;
  return `the program that serves this editor is not answering (${message}). Is it still running?`;
}
