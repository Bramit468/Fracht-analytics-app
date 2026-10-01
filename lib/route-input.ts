import type { VehicleWeights } from "./ptv-emissions";
import { MAX_STOPS, type RouteWaypoint } from "./stops";
import { MAX_VIA_POINTS } from "./via-points";

export interface RouteLookupInput {
  /** Pirmas ir paskutinis – sustojimai; viduryje sustojimai ir tarpiniai taškai, kaip važiuojama. */
  waypoints: RouteWaypoint[];
  avoidFerries: boolean;
  departureAt?: string;
  weights: VehicleWeights;
}

/**
 * Užklausos kūnas iš naršyklės. Tai pasitikėjimo riba: route handler'is
 * pasiekiamas adresu, tad forma tikrinama, o ne tikimasi tik savo formos.
 */
export function parseRouteInput(body: unknown): RouteLookupInput | null {
  if (typeof body !== "object" || body === null) return null;
  const raw = body as Record<string, unknown>;
  if (!Array.isArray(raw.waypoints) || raw.waypoints.length < 2) return null;
  if (raw.waypoints.length > MAX_STOPS + MAX_VIA_POINTS) return null;

  const waypoints: RouteWaypoint[] = [];
  for (const row of raw.waypoints) {
    if (typeof row !== "object" || row === null) return null;
    const item = row as Record<string, unknown>;
    if (item.kind === "stop" && typeof item.address === "string") {
      waypoints.push({
        kind: "stop",
        address: item.address.slice(0, 300),
        point: typeof item.point === "string" ? item.point.slice(0, 40) : undefined,
      });
    } else if (
      item.kind === "via"
      && typeof item.latitude === "number" && Math.abs(item.latitude) <= 90
      && typeof item.longitude === "number" && Math.abs(item.longitude) <= 180
    ) {
      waypoints.push({ kind: "via", latitude: item.latitude, longitude: item.longitude });
    } else {
      return null;
    }
  }
  if (waypoints[0].kind !== "stop" || waypoints[waypoints.length - 1].kind !== "stop") return null;

  const weights = (typeof raw.weights === "object" && raw.weights !== null ? raw.weights : {}) as VehicleWeights;
  return {
    waypoints,
    avoidFerries: raw.avoidFerries === true,
    departureAt: typeof raw.departureAt === "string" && raw.departureAt !== "" ? raw.departureAt : undefined,
    weights,
  };
}
