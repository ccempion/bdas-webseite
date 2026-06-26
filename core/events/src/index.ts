/**
 * Typed in-process event bus.
 *
 * Modules emit events for cross-module reactions instead of calling
 * other modules' services directly (CLAUDE.md §3). Each module declares
 * its event union type and publishes through the shared bus.
 *
 * v1 is synchronous: handlers run in registration order; if a handler
 * throws, the error bubbles up so the publisher can roll back its
 * transaction. The interface is queue-compatible — swapping to a
 * durable queue later requires only a new EventBus implementation.
 */

export type AnyEvent = { readonly type: string };

export type EventHandler<E extends AnyEvent> = (event: E) => void | Promise<void>;

export type Subscription = { readonly unsubscribe: () => void };

export interface EventBus {
  publish<E extends AnyEvent>(event: E): Promise<void>;
  subscribe<E extends AnyEvent>(type: E["type"], handler: EventHandler<E>): Subscription;
}

class InProcessEventBus implements EventBus {
  private readonly handlers = new Map<string, Set<EventHandler<AnyEvent>>>();

  subscribe<E extends AnyEvent>(type: E["type"], handler: EventHandler<E>): Subscription {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    const cast = handler as EventHandler<AnyEvent>;
    set.add(cast);
    return {
      unsubscribe: () => {
        this.handlers.get(type)?.delete(cast);
      },
    };
  }

  async publish<E extends AnyEvent>(event: E): Promise<void> {
    const subs = this.handlers.get(event.type);
    if (!subs) return;
    for (const handler of subs) {
      await handler(event);
    }
  }
}

/**
 * The bus is a process-wide singleton stored on `globalThis`. Next.js can bundle
 * `instrumentation.ts` and route handlers as SEPARATE module instances; a plain
 * module-level `let` gives each its own bus, so subscribers wired at boot
 * (instrumentation) never see events published from route handlers — silently
 * dropping every cross-module reaction (notifications, folder provisioning).
 * A `globalThis` slot keyed by a global-registry symbol (`Symbol.for`, identical
 * across bundles) makes all copies share one bus in the same runtime.
 */
const BUS_KEY = Symbol.for("@bdas/events:bus");

type BusGlobal = { [BUS_KEY]?: EventBus };

function busStore(): BusGlobal {
  return globalThis as unknown as BusGlobal;
}

export function getEventBus(): EventBus {
  const store = busStore();
  return (store[BUS_KEY] ??= new InProcessEventBus());
}

/** Test helper: replace the bus. */
export function setEventBus(bus: EventBus): void {
  busStore()[BUS_KEY] = bus;
}

/** Test helper: reset to a fresh in-process bus. */
export function resetEventBus(): void {
  busStore()[BUS_KEY] = new InProcessEventBus();
}
