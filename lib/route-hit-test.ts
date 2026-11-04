import type { LineCoordinate, SharedRun } from "./route-line";

export type SharedRouteTarget = "route" | "empty";

export interface ScreenPoint {
  x: number;
  y: number;
}

/**
 * Kuri bendro ruožo pusė paspausta ekrane.
 *
 * MapLibre `queryRenderedFeatures` tikrina pradinę GeoJSON liniją ir neatskiria
 * dviejų `line-offset` pusių. Todėl čia koordinates projektuojame į ekraną ir
 * pagal artimiausios atkarpos dešinę / kairę parenkame raudoną arba juodą pusę.
 */
export function sharedRouteTarget(
  point: ScreenPoint,
  runs: readonly SharedRun[],
  project: (coordinate: LineCoordinate) => ScreenPoint,
  maxDistance = 18,
): SharedRouteTarget | null {
  let bestDistance = Infinity;
  let bestSignedOffset = 0;
  let bestSide: 1 | -1 = 1;

  for (const run of runs) {
    for (let index = 1; index < run.coordinates.length; index++) {
      const start = project(run.coordinates[index - 1]);
      const end = project(run.coordinates[index]);
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const lengthSquared = dx * dx + dy * dy;
      if (lengthSquared === 0) continue;

      const progress = Math.max(0, Math.min(1,
        ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
      ));
      const closestX = start.x + progress * dx;
      const closestY = start.y + progress * dy;
      const fromX = point.x - closestX;
      const fromY = point.y - closestY;
      const distance = Math.hypot(fromX, fromY);
      if (distance >= bestDistance) continue;

      const length = Math.sqrt(lengthSquared);
      // Ekrano Y ašis nukreipta žemyn, todėl dešinės pusės normalė yra (-dy, dx).
      bestSignedOffset = fromX * (-dy / length) + fromY * (dx / length);
      bestDistance = distance;
      bestSide = run.side;
    }
  }

  if (bestDistance > maxDistance) return null;
  return bestSignedOffset * bestSide >= 0 ? "empty" : "route";
}
