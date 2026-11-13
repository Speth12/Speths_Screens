// Runs before every IDE test file.
//
// No test reaches a real runtime, so a WebSocket that opens is a stand-in that never connects. A
// real one would fail, and its reconnect timer could fire after a test file's environment is torn
// down, failing the run at random ("location is not defined"). A test that needs a socket of its
// own stubs it with vi.stubGlobal, which this does not get in the way of.
class NoSocket {
  readyState = 0;
  addEventListener() {}
  removeEventListener() {}
  send() {}
  close() {}
}
(globalThis as { WebSocket: unknown }).WebSocket = NoSocket;

export {};
