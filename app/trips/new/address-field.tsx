"use client";

import { useEffect, useRef, useState } from "react";

import { placeLabel, type PhotonPlace } from "@/lib/photon";

import { suggestPlaces } from "./route-lookup";

/** Kiek laukti po paskutinio klavišo, kad nesiųstume užklausos kas simbolį. */
const DELSA_MS = 400;
const MIN_SIMBOLIU = 3;

/**
 * Adreso laukas su PTV pasiūlymais (#65).
 *
 * „Klaipėdos g. 4" PTV grąžina 42 adresus keturiuose miestuose, visus vienodo
 * tikslumo. Imti pirmą reiškia spėti už vartotoją, todėl sąrašas rodomas, o
 * pasirinkus įsimenamos koordinatės.
 *
 * Nepasirinkus laukas veikia kaip paprastas tekstas — maršrutas tada
 * geokoduojamas iš teksto, kaip anksčiau.
 */
export function AddressField({
  name,
  label,
  defaultValue,
  enabled,
  inputClass,
}: {
  name: "origin" | "destination";
  label: string;
  defaultValue: string;
  enabled: boolean;
  inputClass: string;
}) {
  const [query, setQuery] = useState(defaultValue);
  const [places, setPlaces] = useState<PhotonPlace[]>([]);
  const [open, setOpen] = useState(false);
  const [point, setPoint] = useState("");
  const paskutine = useRef("");

  useEffect(() => {
    if (!enabled || query.trim().length < MIN_SIMBOLIU || query === paskutine.current) {
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const found = await suggestPlaces(query);
        if (!cancelled) {
          setPlaces(found);
          setOpen(found.length > 0);
        }
      } catch {
        // Pasiūlymai yra pagalba, ne veiksmas: jų nebuvimas neturi virsti klaida.
      }
    }, DELSA_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, enabled]);

  function choose(place: PhotonPlace) {
    const label = placeLabel(place);
    paskutine.current = label;
    setQuery(label);
    // Photon koordinates duoda iškart, tad antro žingsnio nereikia.
    setPoint(`${place.latitude},${place.longitude}`);
    setOpen(false);
  }

  return (
    <label className="relative block">
      {label}
      <input
        name={name}
        type="text"
        value={query}
        autoComplete="off"
        onChange={(event) => {
          setQuery(event.target.value);
          // Pakeitus tekstą pasirinkimas nebegalioja – kitaip maršrutas eitų
          // į seną tašką, o laukelyje būtų matyti naujas adresas.
          setPoint("");
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className={inputClass}
      />
      <input type="hidden" name={`${name}_point`} value={point} />

      {open && places.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-lg border bg-white shadow-lg">
          {places.map((place) => (
            <li key={`${place.latitude},${place.longitude},${place.label}`}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(place)}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-100"
              >
                <span className="block">{place.label}</span>
                {place.sublabel && (
                  <span className="block text-xs text-slate-500">{place.sublabel}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </label>
  );
}
