import { afterEach, describe, expect, it, vi } from "vitest";
import { getEventBus, resetEventBus } from "./index";

type FooEvent = { type: "foo.happened"; payload: { id: string } };
type BarEvent = { type: "bar.happened"; n: number };

afterEach(() => {
  resetEventBus();
});

describe("InProcessEventBus", () => {
  it("delivers events to matching subscribers", async () => {
    const bus = getEventBus();
    const seen: string[] = [];
    bus.subscribe<FooEvent>("foo.happened", (e) => {
      seen.push(e.payload.id);
    });
    await bus.publish<FooEvent>({ type: "foo.happened", payload: { id: "x" } });
    expect(seen).toEqual(["x"]);
  });

  it("ignores events with no subscribers", async () => {
    const bus = getEventBus();
    await expect(bus.publish({ type: "nobody.cares" })).resolves.toBeUndefined();
  });

  it("delivers to multiple subscribers in order", async () => {
    const bus = getEventBus();
    const calls: number[] = [];
    bus.subscribe<BarEvent>("bar.happened", (e) => {
      calls.push(e.n);
    });
    bus.subscribe<BarEvent>("bar.happened", (e) => {
      calls.push(e.n * 2);
    });
    await bus.publish<BarEvent>({ type: "bar.happened", n: 3 });
    expect(calls).toEqual([3, 6]);
  });

  it("unsubscribe stops delivery", async () => {
    const bus = getEventBus();
    let count = 0;
    const sub = bus.subscribe<FooEvent>("foo.happened", () => {
      count++;
    });
    await bus.publish<FooEvent>({ type: "foo.happened", payload: { id: "1" } });
    sub.unsubscribe();
    await bus.publish<FooEvent>({ type: "foo.happened", payload: { id: "2" } });
    expect(count).toBe(1);
  });

  it("propagates handler errors so publishers can roll back", async () => {
    const bus = getEventBus();
    bus.subscribe<FooEvent>("foo.happened", () => {
      throw new Error("boom");
    });
    await expect(
      bus.publish<FooEvent>({ type: "foo.happened", payload: { id: "x" } }),
    ).rejects.toThrow(/boom/);
  });

  // Regression: instrumentation.ts and route handlers are bundled separately, so
  // the module is evaluated more than once. A subscriber wired by one copy must
  // still receive events published by the other (globalThis-backed singleton).
  it("shares one bus across separate module evaluations", async () => {
    const first = await import("./index");
    let received = 0;
    first.getEventBus().subscribe<FooEvent>("foo.happened", () => {
      received++;
    });

    vi.resetModules(); // force a fresh module instance, as a separate bundle would be
    const second = await import("./index");
    expect(second.getEventBus()).toBe(first.getEventBus()); // same instance via globalThis
    await second.getEventBus().publish<FooEvent>({ type: "foo.happened", payload: { id: "x" } });

    expect(received).toBe(1); // subscriber from the first copy saw the second copy's publish
  });
});
