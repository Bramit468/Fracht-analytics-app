"use client";

import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type ExpressionSpecification,
  type GeoJSONSource,
  type LngLat,
} from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";

import { routeBounds, type LineCoordinate } from "@/lib/route-line";
import type { PtvMapLayer } from "@/lib/ptv-map-tile";
import type { RouteViolation } from "@/lib/ptv-route";
import { anchorsAround, nearestLineIndex, type ViaPoint } from "@/lib/via-points";

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

type Basemap = "roads" | "satellite";

/**
 * Kelių žemėlapis (OpenFreeMap „Liberty“): OpenStreetMap duomenys, be rakto ir be
 * mokesčio. „Google Maps“ plytelių naudoti negalima – jų licencija leidžia jas
 * rodyti tik per „Google“ SDK. „Liberty“ spalvos artimos: oranžiniai greitkeliai,
 * geltoni magistraliniai keliai, balti gatvių tinklai.
 */
const ROADS_STYLE = "https://tiles.openfreemap.org/styles/liberty";

/**
 * Stilius gerai atrodo artinant, bet toli (visas Panevėžys–Oslas maršrutas)
 * keliai tampa plonytėmis linijomis. Čia jie sustorinami tik mažuose masteliuose;
 * spalvos ir sluoksnių tvarka lieka stiliaus.
 */
const ROAD_EMPHASIS: { id: string; minzoom: number; width: [number, number][]; color?: string }[] = [
  { id: "road_motorway_casing", minzoom: 3, width: [[3, 2.2], [5, 2.8], [8, 4], [12, 7], [16, 20]], color: "#d9822b" },
  { id: "road_motorway", minzoom: 3, width: [[3, 1.2], [5, 1.8], [8, 2.6], [12, 5], [16, 16]], color: "#ffae42" },
  { id: "road_trunk_primary_casing", minzoom: 4, width: [[4, 1.8], [5, 2.2], [8, 3.4], [12, 6], [16, 18]], color: "#c9a02f" },
  { id: "road_trunk_primary", minzoom: 4, width: [[4, 0.9], [5, 1.2], [8, 2.2], [12, 4.5], [16, 14]], color: "#ffe066" },
  { id: "road_secondary_tertiary_casing", minzoom: 7, width: [[7, 1.6], [10, 2.4], [12, 4.2], [16, 13]] },
  { id: "road_secondary_tertiary", minzoom: 7, width: [[7, 0.8], [10, 1.4], [12, 3], [16, 11]] },
];

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
// Palydovinis vaizdas be kelių nepraktiškas, todėl ant viršaus dedami keliai ir vietovardžiai.
const SATELLITE_LAYERS: { id: string; path: string; attribution?: string }[] = [
  { id: "sat-imagery", path: "World_Imagery", attribution: "Esri, Maxar, Earthstar Geographics" },
  { id: "sat-roads", path: "Reference/World_Transportation" },
  { id: "sat-labels", path: "Reference/World_Boundaries_and_Places" },
];

/** Maršruto linija: ryški tamsiai mėlyna su balta apvadą, kad matytųsi virš bet kurio kelio. */
const ROUTE_COLOR = "#1d4ed8";
const PREVIEW_COLOR = "#7c3aed";
const zoomWidth = (stops: [number, number][], extra = 0) => [
  "interpolate", ["linear"], ["zoom"],
  ...stops.flatMap(([zoom, width]) => [zoom, width + extra]),
] as ExpressionSpecification;
const ROUTE_WIDTH = [[3, 3], [8, 4.5], [12, 6.5], [16, 10]] as [number, number][];
const CASING_EXTRA = 3;
const HOVER_EXTRA = 2;

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

/** Sustojimo ženklas: pakrovimas, iškrovimas, papildomi. Laukai – iš maršruto atsakymo. */
export interface MapStop {
  latitude: number;
  longitude: number;
  letter: string;
  title: string;
}

const STOP_COLORS = { first: "#16a34a", last: "#dc2626", middle: "#475569" } as const;

interface Pointer {
  lngLat: LngLat;
  point: { x: number; y: number };
}

function lineFeature(coordinates: number[][]) {
  return { type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates } };
}

/**
 * Maršrutas žemėlapyje (#74).
 *
 * Linija ateina iš PTV, tad rodomas tas pats kelias, pagal kurį suskaičiuoti
 * kilometrai ir mokesčiai, o ne panašus lengvojo automobilio maršrutas.
 *
 * Maršrutą redaguoja tempimas: linijos taškas nutempiamas ten, kur reikia, ir
 * tampa tarpiniu tašku (#85). Tempiant maršrutas **perbraižomas vietoje**
 * (`route-preview`, be tinklo užklausos): tik paleidus pelę prašomas tikras
 * PTV maršrutas. Tempimo metu React būsena nekeičiama – viskas vyksta
 * žemėlapio šaltiniuose, todėl forma neperpiešiama.
 */
function RouteMapView({
  line,
  stops = [],
  violations = [],
  via = [],
  busy = false,
  sidePanel,
  onAddVia,
  onMoveVia,
  onRemoveVia,
}: {
  line: LineCoordinate[];
  /** Sustojimai: žymekliai su raidėmis A, B, C… */
  stops?: MapStop[];
  violations?: RouteViolation[];
  /** Tarpiniai taškai, per kuriuos vedamas maršrutas (#85). */
  via?: ViaPoint[];
  /** Skaičiuojamas naujas maršrutas: žemėlapis lieka gyvas, rodomas tik indikatorius. */
  busy?: boolean;
  /** Rodomas tik padidintame žemėlapyje, šone. */
  sidePanel?: ReactNode;
  /** `false` – taškas nepriimtas (riba ar dublis): tempimo peržiūra nuimama. */
  onAddVia?: (point: ViaPoint) => boolean | void;
  onMoveVia?: (index: number, point: ViaPoint) => void;
  onRemoveVia?: (index: number) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [basemap, setBasemap] = useState<Basemap>("roads");
  const basemapRef = useRef(basemap);
  const [visibleLayers, setVisibleLayers] = useState(DEFAULT_VISIBLE_LAYERS);
  const visibleLayersRef = useRef(visibleLayers);
  // Vaizdas pritaikomas tik pirmą kartą ir keičiant adresus; tempiant liniją
  // žmogus jau yra priartinęs, ir šokimas atgal sugadintų kitą tempimą.
  const hasFitted = useRef(false);
  const viaCount = useRef(via.length);
  // Atgaliniai iškvietimai ir naujausi duomenys laikomi `ref`, kad žemėlapio
  // įvykiai visada matytų naujausią reikšmę, o pats žemėlapis nebūtų kuriamas iš naujo.
  const callbacks = useRef({ onAddVia, onMoveVia, onRemoveVia });
  const latest = useRef({ line, stops, via });

  useEffect(() => {
    callbacks.current = { onAddVia, onMoveVia, onRemoveVia };
    latest.current = { line, stops, via };
    viaCount.current = via.length;
  }, [onAddVia, onMoveVia, onRemoveVia, line, stops, via]);

  const markerHooks = useRef<{
    startPreview: (at: number, excludeVia: number | null) => void;
    movePreview: (lngLat: LngLat) => void;
    endPreview: () => void;
  } | null>(null);

  const [ready, setReady] = useState(false);
  const hasRoute = line.length >= 2;

  // Žemėlapis kuriamas vieną kartą. Anksčiau jis buvo griaunamas ir kuriamas iš
  // naujo po kiekvieno formos perpiešimo, todėl plytelės mirksėjo, o
  // vartotojo nustatytas mastelis dingdavo.
  useEffect(() => {
    if (!container.current || !hasRoute) return;

    const map = new MapLibreMap({
      container: container.current,
      style: ROADS_STYLE,
      // Pradinė reikšmė, kurią iškart pakeičia `fitBounds`.
      center: [0, 50],
      zoom: 4,
      cooperativeGestures: true,
      locale: LOCALE,
    });
    mapRef.current = map;

    map.addControl(new NavigationControl(), "top-right");
    // Konteineris keičia dydį ir be lango: tempiamas kampas, visas ekranas.
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(container.current);

    map.on("load", () => {
      for (const { id, minzoom, width, color } of ROAD_EMPHASIS) {
        if (!map.getLayer(id)) continue;
        map.setLayerZoomRange(id, minzoom, 24);
        map.setPaintProperty(id, "line-width", zoomWidth(width));
        if (color) map.setPaintProperty(id, "line-color", color);
      }

      // Palydovas guli virš vektorinio žemėlapio, bet po PTV sluoksniais ir maršrutu.
      for (const { id, path, attribution } of SATELLITE_LAYERS) {
        map.addSource(id, {
          type: "raster",
          tiles: [`${ESRI}/${path}/MapServer/tile/{z}/{y}/{x}`],
          tileSize: 256,
          maxzoom: 19,
          attribution,
        });
        map.addLayer({
          id,
          type: "raster",
          source: id,
          layout: { visibility: basemapRef.current === "satellite" ? "visible" : "none" },
        });
      }

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

      const round = { "line-cap": "round", "line-join": "round" } as const;
      map.addSource("route", { type: "geojson", data: EMPTY_COLLECTION });
      map.addLayer({
        id: "route-casing",
        type: "line",
        source: "route",
        layout: round,
        paint: { "line-color": "#ffffff", "line-width": zoomWidth(ROUTE_WIDTH, CASING_EXTRA) },
      });
      map.addLayer({
        id: "route",
        type: "line",
        source: "route",
        layout: round,
        paint: { "line-color": ROUTE_COLOR, "line-width": zoomWidth(ROUTE_WIDTH) },
      });
      // Nematomas platus sluoksnis: į kelių pikselių liniją pataikyti pirštu neįmanoma.
      map.addLayer({
        id: "route-hit",
        type: "line",
        source: "route",
        layout: round,
        paint: { "line-color": "#000000", "line-width": 24, "line-opacity": 0 },
      });
      // Tempiamas ruožas: vietinis vaizdas be užklausos.
      map.addSource("route-preview", { type: "geojson", data: EMPTY_COLLECTION });
      map.addLayer({
        id: "route-preview-casing",
        type: "line",
        source: "route-preview",
        layout: round,
        paint: { "line-color": "#ffffff", "line-width": zoomWidth(ROUTE_WIDTH, CASING_EXTRA) },
      });
      map.addLayer({
        id: "route-preview",
        type: "line",
        source: "route-preview",
        layout: round,
        paint: { "line-color": PREVIEW_COLOR, "line-width": zoomWidth(ROUTE_WIDTH), "line-dasharray": [2, 1.2] },
      });

      // Tarpinių taškų žymekliai naudoja tą pačią peržiūrą. Skelbiama tik po
      // `load`: anksčiau stiliaus keisti negalima.
      markerHooks.current = { startPreview, movePreview, endPreview };
      setReady(true);
    });

    // Tempimas: tik šaltinio duomenys keičiami, ne React būsena.
    const preview = {
      source: () => map.getSource("route-preview") as GeoJSONSource | undefined,
      frame: 0,
      next: null as number[][] | null,
      /** Linijos indeksai ir taškas, nuo kurių braižoma: gaunami tempimo pradžioje. */
      anchors: null as [LineCoordinate, LineCoordinate] | null,
    };

    function startPreview(at: number, excludeVia: number | null) {
      const { line: current, stops: currentStops, via: currentVia } = latest.current;
      const indices = [
        ...currentStops.map((stop) => nearestLineIndex(current, stop)),
        ...currentVia.flatMap((point, index) => (index === excludeVia ? [] : [nearestLineIndex(current, point)])),
      ];
      const [from, to] = anchorsAround(current.length, indices, at);
      preview.anchors = [current[from], current[to]];
      for (const id of ["route", "route-casing"]) map.setPaintProperty(id, "line-opacity", 0.3);
    }

    function movePreview(lngLat: LngLat) {
      if (!preview.anchors) return;
      preview.next = [preview.anchors[0], [lngLat.lng, lngLat.lat], preview.anchors[1]];
      if (preview.frame) return;
      // Ne dažniau kaip kartą per kadrą: pelė gali siųsti kelis įvykius per 16 ms.
      preview.frame = requestAnimationFrame(() => {
        preview.frame = 0;
        if (preview.next) preview.source()?.setData(lineFeature(preview.next));
      });
    }

    function endPreview() {
      cancelAnimationFrame(preview.frame);
      preview.frame = 0;
      preview.next = null;
      preview.anchors = null;
      preview.source()?.setData(EMPTY_COLLECTION);
      for (const id of ["route", "route-casing"]) map.setPaintProperty(id, "line-opacity", 1);
    }

    // Linijos tempimas veikia tik ant maršruto, o `preventDefault` sustabdo
    // žemėlapio stumdymą. Visur kitur tempimas stumdo žemėlapį kaip įprasta.
    // Taškas pridedamas tik paleidus, tad PTV užklausa viena, o ne po kiekvieno judesio.
    let dragging = false;
    const canvas = map.getCanvas();
    const lineWidth = (extra: number) => zoomWidth(ROUTE_WIDTH, extra);

    function beginDrag(kind: "mouse" | "touch", start: Pointer) {
      dragging = true;
      canvas.style.cursor = "grabbing";
      let last = start.lngLat;
      let moved = false;
      startPreview(nearestLineIndex(latest.current.line, { latitude: start.lngLat.lat, longitude: start.lngLat.lng }), null);

      const move = (event: Pointer) => {
        last = event.lngLat;
        moved ||= Math.hypot(event.point.x - start.point.x, event.point.y - start.point.y) >= MIN_DRAG_PX;
        if (moved) movePreview(last);
      };

      const moveEvent = kind === "mouse" ? "mousemove" : "touchmove";
      map.on(moveEvent, move);
      map.once(kind === "mouse" ? "mouseup" : "touchend", () => {
        map.off(moveEvent, move);
        dragging = false;
        canvas.style.cursor = "";
        map.setPaintProperty("route", "line-width", lineWidth(0));
        map.setPaintProperty("route-casing", "line-width", lineWidth(CASING_EXTRA));
        // Paskutinė žinoma vieta: `touchend` pats koordinačių dažnai neturi.
        // Peržiūra paliekama, kol ateis tikras maršrutas: nuvalius ji sušoktų
        // atgal į seną kelią. Ją nuvalo kitas `line` atnaujinimas.
        const accepted = moved
          ? callbacks.current.onAddVia?.({ latitude: last.lat, longitude: last.lng })
          : false;
        if (accepted === false || accepted === undefined) endPreview();
      });
    }

    map.on("mouseenter", "route-hit", () => {
      if (dragging) return;
      canvas.style.cursor = "grab";
      map.setPaintProperty("route", "line-width", lineWidth(HOVER_EXTRA));
      map.setPaintProperty("route-casing", "line-width", lineWidth(CASING_EXTRA + HOVER_EXTRA));
    });
    map.on("mouseleave", "route-hit", () => {
      if (dragging) return;
      canvas.style.cursor = "";
      map.setPaintProperty("route", "line-width", lineWidth(0));
      map.setPaintProperty("route-casing", "line-width", lineWidth(CASING_EXTRA));
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
      cancelAnimationFrame(preview.frame);
      hasFitted.current = false;
      resizeObserver.disconnect();
      mapRef.current = null;
      markerHooks.current = null;
      setReady(false);
      map.remove();
    };
  }, [hasRoute]);

  // Maršruto linija keičiasi tik duomenimis; tai vienintelis sluoksnis, kuris perpiešiamas.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || line.length < 2) return;

    (map.getSource("route") as GeoJSONSource | undefined)?.setData(lineFeature(line));
    // Tikras maršrutas atėjo: tempimo peržiūra nebereikalinga.
    markerHooks.current?.endPreview();

    if (hasFitted.current && viaCount.current > 0) return;
    const bounds = routeBounds(line);
    if (bounds) {
      // Viršuje paliekama vietos mygtukui „Padidinti“; `maxZoom` – kad trumpas
      // reisas neatsidurtų ties pavieniais namais.
      map.fitBounds(bounds, { padding: { top: 56, left: 48, right: 56, bottom: 40 }, maxZoom: 13, duration: 0 });
      hasFitted.current = true;
    }
  }, [ready, line]);

  // Skaičiavimas baigėsi (net nesėkmingai): peržiūra, kuri laukė rezultato, nuimama.
  useEffect(() => {
    if (!busy) markerHooks.current?.endPreview();
  }, [busy]);

  // Sustojimai ir apribojimai keičiasi retai (tik gavus maršrutą), todėl juos
  // pigiau perkurti nei sekti pokyčius. Tarpiniai taškai – atskirai, žemiau.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;

    const markers: Marker[] = [];

    for (const [index, stop] of stops.entries()) {
      const color = index === 0 ? STOP_COLORS.first : index === stops.length - 1 ? STOP_COLORS.last : STOP_COLORS.middle;
      const marker = new Marker({ color }).setLngLat([stop.longitude, stop.latitude]);
      const element = marker.getElement();
      const label = document.createElement("span");
      label.textContent = stop.letter;
      // Smeigtuko galvutės viduryje yra baltas skritulys, tad raidė tamsi.
      label.style.cssText = "position:absolute;left:0;top:8px;width:27px;text-align:center;color:#111827;font:700 10px/11px sans-serif;pointer-events:none";
      element.append(label);
      element.title = stop.title;
      markers.push(marker.addTo(map));
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

    return () => markers.forEach((marker) => marker.remove());
  }, [ready, stops, violations]);

  // Tarpiniai taškai: paprasti apskritimai su balta apvadą, kad skirtųsi nuo
  // sustojimų smeigtukų. Tempiami, o dukart spustelėjus – pašalinami.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;

    const markers: Marker[] = [];

    for (const [index, point] of via.entries()) {
      // Išorinis 32 px elementas – tai, ką pagriebia pelė ar pirštas; matomas tik 14 px taškas.
      const element = document.createElement("div");
      element.style.cssText = "width:32px;height:32px;display:flex;align-items:center;justify-content:center;cursor:grab;touch-action:none";
      const dot = document.createElement("div");
      dot.style.cssText = `width:14px;height:14px;border-radius:50%;background:${PREVIEW_COLOR};border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.35)`;
      element.append(dot);
      // `mousedown`/`touchstart` čia stabdyti negalima: MapLibre žymeklio tempimą
      // pradeda žemėlapio lygyje ir pats sustabdo stumdymą. Dvigubas spustelėjimas
      // sustabdomas, kad po žymekliu nepriartėtų žemėlapis.
      element.addEventListener("dblclick", (event) => {
        event.stopPropagation();
        callbacks.current.onRemoveVia?.(index);
      });
      element.title = "Tarpinis taškas. Tempkite arba spustelėkite du kartus, kad pašalintumėte.";

      const marker = new Marker({ element, draggable: Boolean(callbacks.current.onMoveVia) })
        .setLngLat([point.longitude, point.latitude])
        .addTo(map);

      marker.on("dragstart", () => {
        const { lng, lat } = marker.getLngLat();
        markerHooks.current?.startPreview(nearestLineIndex(latest.current.line, { latitude: lat, longitude: lng }), index);
      });
      marker.on("drag", () => markerHooks.current?.movePreview(marker.getLngLat()));
      marker.on("dragend", () => {
        const { lng, lat } = marker.getLngLat();
        callbacks.current.onMoveVia?.(index, { latitude: lat, longitude: lng });
      });
      markers.push(marker);
    }

    return () => markers.forEach((marker) => marker.remove());
  }, [ready, via]);

  useEffect(() => {
    basemapRef.current = basemap;
    const map = mapRef.current;
    if (!ready || !map) return;

    for (const { id } of SATELLITE_LAYERS) {
      map.setLayoutProperty(id, "visibility", basemap === "satellite" ? "visible" : "none");
    }
  }, [ready, basemap]);

  // Per visą ekraną puslapio slinkti nebereikia, todėl ratukas keičia mastelį, o Esc grįžta.
  useEffect(() => {
    const map = mapRef.current;
    if (ready && map) {
      if (expanded) map.cooperativeGestures.disable();
      else map.cooperativeGestures.enable();
    }
    if (!expanded) return;

    const onKey = (event: KeyboardEvent) => {
      // Esc adreso pasiūlymų sąraše uždaro sąrašą, o ne žemėlapį.
      if (event.key === "Escape" && !(event.target instanceof HTMLInputElement)) setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [ready, expanded]);

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

  return <div className={expanded ? "fixed inset-0 z-50 flex flex-col bg-page p-3" : "mt-3"}>
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
      <label className="flex cursor-pointer items-center gap-2">
        <input type="checkbox" checked={basemap === "satellite"} onChange={(event) => setBasemap(event.target.checked ? "satellite" : "roads")} />
        Palydovinis vaizdas
      </label>
    </fieldset>
    <div className={expanded ? "flex min-h-0 flex-1 gap-3" : ""}>
      <div
        className={expanded
          ? "relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-lg border"
          : "relative h-[26rem] min-h-48 resize-y overflow-hidden rounded-lg border"}
      >
        <div ref={container} className="h-full w-full" aria-label="Maršrutas žemėlapyje" />
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          aria-label={expanded ? "Sumažinti žemėlapį" : "Padidinti žemėlapį"}
          className="absolute left-2 top-2 z-10 rounded-md border bg-surface px-3 py-2 text-sm font-medium shadow"
        >
          {expanded ? "Sumažinti (Esc)" : "Padidinti"}
        </button>
        {busy && <p role="status" className="absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-full border bg-surface px-3 py-1 text-sm shadow">
          Skaičiuojamas maršrutas…
        </p>}
      </div>
      {expanded && sidePanel && <aside aria-label="Sustojimai" className="w-80 shrink-0 overflow-y-auto rounded-lg border bg-surface p-3">
        {sidePanel}
      </aside>}
    </div>
    {onAddVia && <p className="mt-2 text-sm text-muted">
      Pagriebkite maršruto liniją ir nutempkite – maršrutas eis per tą vietą (violetinis taškas).
      Tempiant kitur, žemėlapis slenka. Mastelis: +/− mygtukai arba Ctrl + ratukas (telefone – du pirštai).
      Mygtukas „Padidinti“ atidaro žemėlapį per visą ekraną.
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

export const RouteMap = memo(RouteMapView);
