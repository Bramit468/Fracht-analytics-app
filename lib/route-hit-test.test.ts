import { describe, expect, it } from "vitest";

import { sharedRouteTarget } from "./route-hit-test";
import type { LineCoordinate, SharedRun } from "./route-line";

const project = ([x, y]: LineCoordinate) => ({ x, y });

describe("sharedRouteTarget", () => {
  it("į dešinę nuo linijos parenka raudoną, į kairę – juodą", () => {
    const runs: SharedRun[] = [{ coordinates: [[0, 0], [100, 0]], side: 1 }];
    expect(sharedRouteTarget({ x: 50, y: 5 }, runs, project)).toBe("empty");
    expect(sharedRouteTarget({ x: 50, y: -5 }, runs, project)).toBe("route");
  });

  it("veikia ir kai raudona pusė yra kairėje bei linija vertikali", () => {
    const runs: SharedRun[] = [{ coordinates: [[0, 0], [0, 100]], side: -1 }];
    expect(sharedRouteTarget({ x: 5, y: 50 }, runs, project)).toBe("empty");
    expect(sharedRouteTarget({ x: -5, y: 50 }, runs, project)).toBe("route");
  });

  it("tolimas paspaudimas nėra bendro ruožo pasirinkimas", () => {
    const runs: SharedRun[] = [{ coordinates: [[0, 0], [100, 0]], side: 1 }];
    expect(sharedRouteTarget({ x: 50, y: 30 }, runs, project)).toBeNull();
  });
});
