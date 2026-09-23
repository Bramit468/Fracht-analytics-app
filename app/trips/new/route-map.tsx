"use client";

import { useEffect, useRef } from "react";
import { Map as MapLibreMap, Marker, NavigationControl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { routeBounds, type LineCoordinate } from "@/lib/route-line";

/**
 * Maršrutas žemėlapyje (#74).
 *
 * MapLibre ir OpenStreetMap plytelės — be rakto ir be mokesčio. Linija ateina
 * iš PTV, tad rodomas tas pats kelias, pagal kurį suskaičiuoti kilometrai ir
 * mokesčiai, o ne panašus lengvojo automobilio maršrutas.
 */
export function RouteMap({ line }: { line: LineCoordinate[] }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current || line.length < 2) return;

    const bounds = routeBounds(line);
    const map = new MapLibreMap({
      container: container.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            // Privaloma pagal OSM naudojimo sąlygas.
            attribution: "&copy; OpenStreetMap",
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
      // Pradinė reikšmė, kurią iškart pakeičia `fitBounds`.
      center: line[0],
      zoom: 4,
    });

    map.addControl(new NavigationControl(), "top-right");

    map.on("load", () => {
      map.addSource("route", {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: line } },
      });
      map.addLayer({
        id: "route",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#2563eb", "line-width": 4 },
      });

      for (const [point, color] of [[line[0], "#16a34a"], [line[line.length - 1], "#dc2626"]] as const) {
        new Marker({ color }).setLngLat(point).addTo(map);
      }

      if (bounds) map.fitBounds(bounds, { padding: 40, duration: 0 });
    });

    return () => map.remove();
  }, [line]);

  if (line.length < 2) return null;

  return (
    <div
      ref={container}
      className="mt-3 h-80 w-full overflow-hidden rounded-lg border"
      aria-label="Maršrutas žemėlapyje"
    />
  );
}
