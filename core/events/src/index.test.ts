import { afterEach, describe, expect, it } from "vitest";
import { getEventBus, resetEventBus } from "./index.js";

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
});
