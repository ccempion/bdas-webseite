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

export type EventHandler<E extends AnyEvent> = (
  event: E,
) => void | Promise<void>;

export type Subscription = { readonly unsubscribe: () => void };

export interface EventBus {
  publish<E extends AnyEvent>(event: E): Promise<void>;
  subscribe<E extends AnyEvent>(
    type: E["type"],
    handler: EventHandler<E>,
  ): Subscription;
}

class InProcessEventBus implements EventBus {
  private readonly handlers = new Map<string, Set<EventHandler<AnyEvent>>>();

  subscribe<E extends AnyEvent>(
    type: E["type"],
    handler: EventHandler<E>,
  ): Subscription {
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

let _bus: EventBus = new InProcessEventBus();

export function getEventBus(): EventBus {
  return _bus;
}

/** Test helper: replace the bus. */
export function setEventBus(bus: EventBus): void {
  _bus = bus;
}

/** Test helper: reset to a fresh in-process bus. */
export function resetEventBus(): void {
  _bus = new InProcessEventBus();
}
