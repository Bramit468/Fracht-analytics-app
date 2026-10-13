"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { LngLatBounds, Map as MapLibreMap, Marker, NavigationControl, Popup, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { PTV_VECTOR_STYLE, ptvVectorProxyUrl } from "@/lib/ptv-map-tile";

// Tas pats worker kaip maršruto žemėlapyje: Next.js sugeneruotas Vercel'yje neveikė.
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

/** Kas kiek atnaujinti vietas. Tiekėjas pats siunčia kas kelias minutes. */
const ATNAUJINTI_KAS_MS = 60_000;

export interface LiveTruck {
  plate: string;
  latitude: number;
  longitude: number;
  /** Jau paruoštas tekstas, pvz. „Važiuoja 81 km/h“ – tas pats kaip lentelėje. */
  state: string;
  moving: boolean;
  gpsTime: string;
}

export function LiveMap({ trucks }: { trucks: LiveTruck[] }) {
  const router = useRouter();
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const fitted = useRef(false);

  // Serverio komponentas iš naujo paima telematiką; žemėlapis lieka tas pats.
  // Nematomas skirtukas neatnaujinamas: pamirštas fone jis per parą išsiųstų
  // tūkstančius užklausų, kurių niekas nemato. Grįžus atnaujinama iškart.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = setInterval(refresh, ATNAUJINTI_KAS_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);

  useEffect(() => {
    if (!container.current) return;

    const origin = window.location.origin;
    const map = new MapLibreMap({
      container: container.current,
      style: PTV_VECTOR_STYLE,
      transformRequest: (url) => {
        const proxied = ptvVectorProxyUrl(url, origin);
        return proxied ? { url: proxied } : undefined;
      },
      center: [15, 52],
      zoom: 3.5,
      cooperativeGestures: true,
    });
    map.addControl(new NavigationControl(), "top-right");
    mapRef.current = map;

    return () => {
      mapRef.current = null;
      map.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const marker of markers.current) marker.remove();
    markers.current = trucks.map((truck) => {
      const element = document.createElement("div");
      element.textContent = truck.plate;
      element.className = `cursor-pointer whitespace-nowrap rounded-md border px-1.5 py-0.5 text-xs font-semibold shadow ${
        truck.moving ? "border-good bg-accent text-accent-ink" : "border-line bg-surface text-ink"
      }`;
      return new Marker({ element })
        .setLngLat([truck.longitude, truck.latitude])
        // `setText`, ne `setHTML`: numeris ir laikas ateina iš tiekėjo.
        .setPopup(new Popup({ offset: 14 }).setText(`${truck.plate} · ${truck.state} · ${truck.gpsTime}`))
        .addTo(map);
    });

    // Vaizdas pritaikomas tik pirmą kartą: atnaujinimas neturi numesti mastelio.
    if (!fitted.current && trucks.length > 0) {
      const bounds = new LngLatBounds();
      for (const truck of trucks) bounds.extend([truck.longitude, truck.latitude]);
      map.fitBounds(bounds, { padding: 48, maxZoom: 9, animate: false });
      fitted.current = true;
    }
  }, [trucks]);

  return <div ref={container} role="img" aria-label="Furų vietos žemėlapyje" className="h-96 w-full overflow-hidden rounded-2xl border" />;
}
