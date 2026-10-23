export class EventBus {
  private handlers = new Map<string, Set<(payload: unknown) => void>>();

  emit(type: string, payload?: unknown): void {
    this.handlers.get(type)?.forEach((fn) => fn(payload));
    if (type !== "*") {
      this.handlers.get("*")?.forEach((fn) => fn({ type, payload }));
    }
  }

  on(type: string, fn: (payload: unknown) => void): () => void {
    let set = this.handlers.get(type);
    if (!set) { set = new Set(); this.handlers.set(type, set); }
    set.add(fn);
    return () => {
      this.handlers.get(type)?.delete(fn);
    };
  }
}

export const eventBus = new EventBus();
