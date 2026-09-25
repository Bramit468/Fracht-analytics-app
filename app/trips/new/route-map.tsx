"use client";

import { useEffect, useRef, useState } from "react";
import { Map as MapLibreMap, Marker, NavigationControl, Popup, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { routeBounds, type LineCoordinate } from "@/lib/route-line";
import type { PtvMapLayer } from "@/lib/ptv-map-tile";
import type { RouteViolation } from "@/lib/ptv-route";
import type { ViaPoint } from "@/lib/via-points";

// MapLibre 6 worker turi importuoti greta esantį shared modulį. Next.js
// sugeneruotas worker URL Vercel aplinkoje to modulio neturėjo, todėl
// bazinis žemėlapis pasirodydavo, o GeoJSON maršruto linija – ne.
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

const MAP_LAYERS: { layer: PtvMapLayer; label: string; opacity: number }[] = [
  { layer: "trafficIncidents", label: "Eismo įvykiai ir uždarymai", opacity: 0.8 },
  { layer: "restrictions", label: "Vilkikų apribojimai", opacity: 0.65 },
  { layer: "toll", label: "Mokami keliai", opacity: 0.55 },
  { layer: "lowEmissionZones", label: "Mažos taršos zonos", opacity: 0.45 },
];

const DEFAULT_VISIBLE_LAYERS: Record<PtvMapLayer, boolean> = {
  trafficIncidents: true,
  restrictions: true,
  toll: false,
  lowEmissionZones: false,
};

function mapLayerId(layer: PtvMapLayer): string {
  return `ptv-${layer}`;
}

/**
 * Maršrutas žemėlapyje (#74).
 *
 * MapLibre ir OpenStreetMap plytelės — be rakto ir be mokesčio. Linija ateina
 * iš PTV, tad rodomas tas pats kelias, pagal kurį suskaičiuoti kilometrai ir
 * mokesčiai, o ne panašus lengvojo automobilio maršrutas.
 */
export function RouteMap({
  line,
  violations = [],
  via = [],
  onAddVia,
  onMoveVia,
  onRemoveVia,
}: {
  line: LineCoordinate[];
  violations?: RouteViolation[];
  /** Tarpiniai taškai, per kuriuos vedamas maršrutas (#85). */
  via?: ViaPoint[];
  onAddVia?: (point: ViaPoint) => void;
  onMoveVia?: (index: number, point: ViaPoint) => void;
  onRemoveVia?: (index: number) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [visibleLayers, setVisibleLayers] = useState(DEFAULT_VISIBLE_LAYERS);
  const visibleLayersRef = useRef(visibleLayers);
  // Atgaliniai iškvietimai laikomi `ref`, kad žemėlapio įvykiai visada kviestų
  // naujausią funkciją, o pats žemėlapis nebūtų kuriamas iš naujo.
  const callbacks = useRef({ onAddVia, onMoveVia, onRemoveVia });

  useEffect(() => {
    callbacks.current = { onAddVia, onMoveVia, onRemoveVia };
  }, [onAddVia, onMoveVia, onRemoveVia]);

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
    mapRef.current = map;

    map.addControl(new NavigationControl(), "top-right");

    map.on("load", () => {
      for (const { layer, opacity } of MAP_LAYERS) {
        const id = mapLayerId(layer);
        map.addSource(id, {
          type: "raster",
          tiles: [`/api/ptv-map/${layer}/{z}/{x}/{y}`],
          tileSize: 256,
          maxzoom: 22,
          attribution: "&copy; 2026 PTV Logistics, HERE",
        });
        map.addLayer({
          id,
          type: "raster",
          source: id,
          layout: { visibility: visibleLayersRef.current[layer] ? "visible" : "none" },
          paint: { "raster-opacity": opacity },
        });
      }

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

      for (const violation of violations) {
        if (violation.latitude === undefined || violation.longitude === undefined) continue;
        new Marker({ color: "#f59e0b" })
          .setLngLat([violation.longitude, violation.latitude])
          .setPopup(new Popup({ offset: 25 }).setText(violation.message))
          .addTo(map);
      }

      // Tarpiniai taškai: tempiami, o paspaudus – pašalinami. Maršrutas
      // perskaičiuojamas tik paleidus pelę, todėl užklausų audros nėra (#85).
      for (const [index, point] of via.entries()) {
        const marker = new Marker({ color: "#7c3aed", draggable: Boolean(onMoveVia) })
          .setLngLat([point.longitude, point.latitude])
          .addTo(map);

        marker.on("dragend", () => {
          const { lng, lat } = marker.getLngLat();
          callbacks.current.onMoveVia?.(index, { latitude: lat, longitude: lng });
        });

        marker.getElement().addEventListener("click", (event) => {
          event.stopPropagation();
          callbacks.current.onRemoveVia?.(index);
        });
        marker.getElement().title = "Tarpinis taškas. Tempkite arba spustelėkite, kad pašalintumėte.";
      }

      if (bounds) map.fitBounds(bounds, { padding: 40, duration: 0 });
    });

    if (onAddVia) {
      map.on("click", (event) => {
        callbacks.current.onAddVia?.({
          latitude: event.lngLat.lat,
          longitude: event.lngLat.lng,
        });
      });
    }

    return () => {
      mapRef.current = null;
      map.remove();
    };
  }, [line, violations, via, onAddVia, onMoveVia]);

  useEffect(() => {
    visibleLayersRef.current = visibleLayers;
    const map = mapRef.current;
    if (!map) return;

    for (const { layer } of MAP_LAYERS) {
      const id = mapLayerId(layer);
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, "visibility", visibleLayers[layer] ? "visible" : "none");
      }
    }
  }, [visibleLayers]);

  if (line.length < 2) return null;

  return <div className="mt-3">
    <fieldset className="mb-2 flex flex-wrap gap-x-4 gap-y-2 rounded-lg border bg-slate-50 px-3 py-2 text-sm">
      <legend className="px-1 font-medium text-slate-700">Žemėlapio sluoksniai</legend>
      {MAP_LAYERS.map(({ layer, label }) => <label key={layer} className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={visibleLayers[layer]}
          onChange={() => setVisibleLayers((current) => ({ ...current, [layer]: !current[layer] }))}
        />
        {label}
      </label>)}
    </fieldset>
    <div
      ref={container}
      className="h-80 w-full overflow-hidden rounded-lg border"
      aria-label="Maršrutas žemėlapyje"
    />
    {onAddVia && <p className="mt-2 text-sm text-slate-600">
      Spustelėkite žemėlapį, kad maršrutas eitų per tą vietą. Tarpinį tašką galima tempti, o
      spustelėjus – pašalinti. {via.length > 0 && `Dabar tarpinių taškų: ${via.length}.`}
    </p>}
  </div>;
}
