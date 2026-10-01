"use client";

import { useEffect, useRef, useState } from "react";
import {
  FullscreenControl,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type GeoJSONSource,
  type LngLat,
} from "maplibre-gl";
import type { FeatureCollection } from "geojson";
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

/** Mažiau nei tiek pikselių nuvilkta linija laikoma paprastu spustelėjimu, o ne taško pridėjimu. */
const MIN_DRAG_PX = 5;

const EMPTY_COLLECTION: FeatureCollection = { type: "FeatureCollection", features: [] };

// Ctrl + ratukas (Mac – ⌘) keičia mastelį, o paprastas slinkimas slenka puslapį;
// jutikliniame ekrane žemėlapį judina du pirštai, vienas – slenka puslapį.
const LOCALE = {
  "CooperativeGesturesHandler.WindowsHelpText": "Mastelį keisite laikydami Ctrl ir sukdami pelės ratuką",
  "CooperativeGesturesHandler.MacHelpText": "Mastelį keisite laikydami ⌘ ir sukdami pelės ratuką",
  "CooperativeGesturesHandler.MobileHelpText": "Žemėlapį judinkite dviem pirštais",
};

interface Pointer {
  lngLat: LngLat;
  point: { x: number; y: number };
}

/**
 * Maršrutas žemėlapyje (#74).
 *
 * MapLibre ir OpenStreetMap plytelės — be rakto ir be mokesčio. Linija ateina
 * iš PTV, tad rodomas tas pats kelias, pagal kurį suskaičiuoti kilometrai ir
 * mokesčiai, o ne panašus lengvojo automobilio maršrutas.
 *
 * Maršrutą redaguoja tempimas: linijos taškas nutempiamas ten, kur reikia, ir
 * tampa tarpiniu tašku (#85).
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
  const wrapper = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [visibleLayers, setVisibleLayers] = useState(DEFAULT_VISIBLE_LAYERS);
  const visibleLayersRef = useRef(visibleLayers);
  // Vaizdas pritaikomas tik pirmą kartą ir keičiant adresus; tempiant liniją
  // žmogus jau yra priartinęs, ir šokimas atgal sugadintų kitą tempimą.
  const hasFitted = useRef(false);
  const viaCount = useRef(via.length);
  // Atgaliniai iškvietimai laikomi `ref`, kad žemėlapio įvykiai visada kviestų
  // naujausią funkciją, o pats žemėlapis nebūtų kuriamas iš naujo.
  const callbacks = useRef({ onAddVia, onMoveVia, onRemoveVia });

  useEffect(() => {
    callbacks.current = { onAddVia, onMoveVia, onRemoveVia };
    viaCount.current = via.length;
  }, [onAddVia, onMoveVia, onRemoveVia, via.length]);

  const [ready, setReady] = useState(false);
  const hasRoute = line.length >= 2;

  // Žemėlapis kuriamas vieną kartą. Anksčiau jis buvo griaunamas ir kuriamas iš
  // naujo po kiekvieno formos perpiešimo, todėl plytelės mirksėjo, o
  // vartotojo nustatytas mastelis dingdavo.
  useEffect(() => {
    if (!container.current || !hasRoute) return;

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
      center: [0, 50],
      zoom: 4,
      cooperativeGestures: true,
      locale: LOCALE,
    });
    mapRef.current = map;

    map.addControl(new NavigationControl(), "top-right");
    // Per visą ekraną rodomas apvalkalas, ne tik žemėlapis, kad liktų ir sluoksnių
    // pasirinkimas. MapLibre per visą ekraną pats išjungia cooperativeGestures.
    const fullscreen = new FullscreenControl({ container: wrapper.current ?? undefined });
    fullscreen.on("fullscreenstart", () => setExpanded(true));
    fullscreen.on("fullscreenend", () => setExpanded(false));
    map.addControl(fullscreen, "top-right");

    // Konteineris keičia dydį ir be lango: tempiamas kampas, visas ekranas.
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(container.current);

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

      map.addSource("route", { type: "geojson", data: EMPTY_COLLECTION });
      map.addLayer({
        id: "route",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#2563eb", "line-width": 4 },
      });
      // Nematomas platus sluoksnis: į 4 px liniją pataikyti pirštu neįmanoma.
      map.addLayer({
        id: "route-hit",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#000000", "line-width": 24, "line-opacity": 0 },
      });
      // Taškas, kuris seka žymeklį tempiant liniją.
      map.addSource("drag-ghost", { type: "geojson", data: EMPTY_COLLECTION });
      map.addLayer({
        id: "drag-ghost",
        type: "circle",
        source: "drag-ghost",
        paint: {
          "circle-radius": 8,
          "circle-color": "#7c3aed",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 3,
        },
      });

      setReady(true);
    });

    // Linijos tempimas veikia tik ant maršruto, o `preventDefault` sustabdo
    // žemėlapio stumdymą. Visur kitur tempimas stumdo žemėlapį kaip įprasta.
    // Taškas pridedamas tik paleidus, tad PTV užklausa viena, o ne po kiekvieno judesio.
    let dragging = false;
    const canvas = map.getCanvas();

    function beginDrag(kind: "mouse" | "touch", start: Pointer) {
      dragging = true;
      canvas.style.cursor = "grabbing";
      let last = start.lngLat;
      let moved = false;

      const move = (event: Pointer) => {
        last = event.lngLat;
        moved ||= Math.hypot(event.point.x - start.point.x, event.point.y - start.point.y) >= MIN_DRAG_PX;
        if (!moved) return;
        (map.getSource("drag-ghost") as GeoJSONSource | undefined)?.setData({
          type: "Feature",
          properties: {},
          geometry: { type: "Point", coordinates: [last.lng, last.lat] },
        });
      };

      const moveEvent = kind === "mouse" ? "mousemove" : "touchmove";
      map.on(moveEvent, move);
      map.once(kind === "mouse" ? "mouseup" : "touchend", () => {
        map.off(moveEvent, move);
        dragging = false;
        canvas.style.cursor = "";
        map.setPaintProperty("route", "line-width", 4);
        (map.getSource("drag-ghost") as GeoJSONSource | undefined)?.setData(EMPTY_COLLECTION);
        // Paskutinė žinoma vieta: `touchend` pats koordinačių dažnai neturi.
        if (moved) callbacks.current.onAddVia?.({ latitude: last.lat, longitude: last.lng });
      });
    }

    map.on("mouseenter", "route-hit", () => {
      if (dragging) return;
      canvas.style.cursor = "grab";
      map.setPaintProperty("route", "line-width", 7);
    });
    map.on("mouseleave", "route-hit", () => {
      if (dragging) return;
      canvas.style.cursor = "";
      map.setPaintProperty("route", "line-width", 4);
    });
    map.on("mousedown", "route-hit", (event) => {
      event.preventDefault();
      beginDrag("mouse", event);
    });
    map.on("touchstart", "route-hit", (event) => {
      // Du pirštai yra mastelio keitimas, o ne taško tempimas.
      if (event.points.length !== 1) return;
      event.preventDefault();
      beginDrag("touch", { lngLat: event.lngLat, point: event.points[0] });
    });

    return () => {
      hasFitted.current = false;
      resizeObserver.disconnect();
      mapRef.current = null;
      setReady(false);
      map.remove();
    };
  }, [hasRoute]);

  // Maršruto linija keičiasi tik duomenimis.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || line.length < 2) return;

    (map.getSource("route") as GeoJSONSource | undefined)?.setData({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: line },
    });

    if (hasFitted.current && viaCount.current > 0) return;
    const bounds = routeBounds(line);
    if (bounds) {
      map.fitBounds(bounds, { padding: 40, duration: 0 });
      hasFitted.current = true;
    }
  }, [ready, line]);

  // Žymekliai yra paprasti DOM elementai, todėl juos pigiau perkurti nei sekti pokyčius.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || line.length < 2) return;

    const markers: Marker[] = [];

    for (const [point, color] of [[line[0], "#16a34a"], [line[line.length - 1], "#dc2626"]] as const) {
      markers.push(new Marker({ color }).setLngLat(point).addTo(map));
    }

    for (const violation of violations) {
      if (violation.latitude === undefined || violation.longitude === undefined) continue;
      markers.push(
        new Marker({ color: "#f59e0b" })
          .setLngLat([violation.longitude, violation.latitude])
          .setPopup(new Popup({ offset: 25 }).setText(violation.message))
          .addTo(map),
      );
    }

    // Tarpiniai taškai: tempiami, o dukart spustelėjus – pašalinami. Maršrutas
    // perskaičiuojamas tik paleidus pelę, todėl užklausų audros nėra (#85).
    for (const [index, point] of via.entries()) {
      const marker = new Marker({ color: "#7c3aed", draggable: Boolean(callbacks.current.onMoveVia) })
        .setLngLat([point.longitude, point.latitude])
        .addTo(map);

      marker.on("dragend", () => {
        const { lng, lat } = marker.getLngLat();
        callbacks.current.onMoveVia?.(index, { latitude: lat, longitude: lng });
      });

      const element = marker.getElement();
      // `mousedown`/`touchstart` čia stabdyti negalima: MapLibre žymeklio tempimą
      // pradeda žemėlapio lygyje ir pats sustabdo stumdymą. Dvigubas spustelėjimas
      // sustabdomas, kad po žymekliu nepriartėtų žemėlapis.
      element.addEventListener("dblclick", (event) => {
        event.stopPropagation();
        callbacks.current.onRemoveVia?.(index);
      });
      element.style.cursor = "grab";
      element.style.touchAction = "none";
      element.title = "Tarpinis taškas. Tempkite arba spustelėkite du kartus, kad pašalintumėte.";
      markers.push(marker);
    }

    return () => markers.forEach((marker) => marker.remove());
  }, [ready, line, violations, via]);

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

  if (!hasRoute) return null;

  return <div
    ref={wrapper}
    className={expanded ? "flex h-full flex-col bg-page p-3" : "mt-3"}
  >
    <fieldset className="mb-2 flex flex-wrap gap-x-4 gap-y-2 rounded-lg border bg-page px-3 py-2 text-sm">
      <legend className="px-1 font-medium text-ink">Žemėlapio sluoksniai</legend>
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
      className={expanded
        ? "min-h-0 w-full flex-1 overflow-hidden rounded-lg border"
        : "h-80 min-h-48 w-full resize-y overflow-hidden rounded-lg border"}
      aria-label="Maršrutas žemėlapyje"
    />
    {onAddVia && <p className="mt-2 text-sm text-muted">
      Pagriebkite maršruto liniją ir nutempkite – maršrutas eis per tą vietą. Tempiant kitur,
      žemėlapis slenka. Mastelis: +/− mygtukai arba Ctrl + ratukas (telefone – du pirštai).
      Mygtukas viršuje dešinėje padidina žemėlapį per visą ekraną.
    </p>}
    {via.length > 0 && <ul className="mt-2 flex flex-wrap gap-2 text-sm">
      {via.map((point, index) => <li key={`${point.latitude}-${point.longitude}`} className="flex items-center gap-2 rounded-lg border bg-surface px-2 py-1">
        <span className="tabular-nums">Taškas {index + 1}: {point.latitude.toFixed(3)}, {point.longitude.toFixed(3)}</span>
        {onRemoveVia && <button type="button" onClick={() => onRemoveVia(index)} aria-label={`Pašalinti tarpinį tašką ${index + 1}`} className="underline">
          Pašalinti
        </button>}
      </li>)}
    </ul>}
  </div>;
}
