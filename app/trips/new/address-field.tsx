"use client";

import { useState } from "react";

import { addressLabel, type FoundAddress } from "@/lib/nominatim";

import { searchAddress } from "./route-lookup";

/**
 * Adreso laukas su paieška lietuviškai (#73).
 *
 * Paieška vyksta paspaudus mygtuką, o ne rašant: Nominatim viešo serverio
 * taisyklės neleidžia siųsti užklausos po kiekvieno klavišo. Mainais gaunama
 * visa Europa lietuviškai — „Oslas, Norvegija", „Hamburgas, Vokietija" — be
 * rakto, be serverio ir be mokesčio.
 *
 * Pasirinkus įsimenamos koordinatės, ir maršrutas skaičiuojamas nuo jų.
 * Nepasirinkus laukas veikia kaip paprastas tekstas.
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
  const [found, setFound] = useState<FoundAddress[]>([]);
  const [point, setPoint] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function search() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const results = await searchAddress(query);
      setFound(results);
      if (results.length === 0) {
        setMessage("Tokio adreso rasti nepavyko. Pabandykite trumpiau arba pridėkite miestą.");
      }
    } catch {
      setMessage("Nepavyko pasiekti adresų paieškos.");
    } finally {
      setBusy(false);
    }
  }

  function choose(address: FoundAddress) {
    setQuery(addressLabel(address));
    setPoint(`${address.latitude},${address.longitude}`);
    setFound([]);
    setMessage("");
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="block">
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
            setFound([]);
          }}
          onKeyDown={(event) => {
            // Enter laukelyje reikštų formos pateikimą; čia jis reiškia paiešką.
            if (enabled && event.key === "Enter") {
              event.preventDefault();
              void search();
            }
          }}
          className={inputClass}
        />
      </label>

      {enabled && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy || query.trim().length < 3}
            onClick={() => void search()}
            className="rounded-lg border bg-white px-3 py-2 text-sm disabled:opacity-50"
          >
            {busy ? "Ieškoma…" : "Ieškoti adreso"}
          </button>
          {point && <span className="text-sm text-green-700">Adresas patvirtintas</span>}
          {message && <span className="text-sm text-slate-600">{message}</span>}
        </div>
      )}

      {found.length > 0 && (
        <ul className="overflow-hidden rounded-lg border bg-white">
          {found.map((address) => (
            <li key={`${address.latitude},${address.longitude}`}>
              <button
                type="button"
                onClick={() => choose(address)}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-100"
              >
                <span className="block">{address.label}</span>
                {address.sublabel && (
                  <span className="block text-xs text-slate-500">{address.sublabel}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <input type="hidden" name={`${name}_point`} value={point} />
    </div>
  );
}
