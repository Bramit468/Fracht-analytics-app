"use client";

import { useEffect, useId, useRef, useState } from "react";

import { MIN_ADDRESS_QUERY, type AddressSuggestion } from "@/lib/address-suggest";
import { MIN_POSTAL_DIGITS, parsePostalQuery } from "@/lib/postal-code";

import { resolveAddress } from "./route-lookup";

/** Pauzė po paskutinio klavišo prieš kreipiantis į paiešką. */
const DEBOUNCE_MS = 300;
/** Kiek ankstesnių paieškų atsiminti, kad ištrynus raidę nereikėtų kreiptis vėl. */
const CACHE_LIMIT = 30;

/**
 * Adreso laukas su pasiūlymais rašant (#73).
 *
 * Kai sustojama rašyti, po lauku atsiranda PTV pasiūlymai lietuviškai. Pasirinkus
 * įsimenamos koordinatės, ir maršrutas skaičiuojamas nuo jų. Nepasirinkus laukas
 * veikia kaip paprastas tekstas – maršrutas geokoduos tai, kas įrašyta.
 *
 * Laukas valdomas iš išorės (`value`, `point`): sustojimų sąrašas yra vienas
 * šaltinis, o tas pats adresas redaguojamas ir formoje, ir padidintame
 * žemėlapyje. `name` nurodomas tik tada, kai laukas yra formos dalis.
 *
 * Pasenusi užklausa nutraukiama `AbortController`, kad lėtesnis atsakymas į
 * ankstesnį tekstą neperrašytų naujesnio.
 */
export function AddressField({
  name,
  label,
  value,
  point,
  onChange,
  enabled,
  inputClass,
}: {
  /** Formos laukas (`origin`, `destination`); papildomi sustojimai formos nesiunčia. */
  name?: "origin" | "destination";
  label: string;
  value: string;
  /** „55.7,24.3“ pasirinkus pasiūlymą, kitaip tuščia. */
  point: string;
  onChange: (value: string, point: string) => void;
  enabled: boolean;
  inputClass: string;
}) {
  const listId = useId();
  const query = value;
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const controller = useRef<AbortController | undefined>(undefined);
  const cache = useRef(new Map<string, AddressSuggestion[]>());
  // Didėja su kiekvienu pasirinkimu ar pakeitimu; vėluojantis atsakymas, kurio
  // numeris nebe tas, ignoruojamas.
  const pick = useRef(0);

  useEffect(() => () => {
    clearTimeout(timer.current);
    controller.current?.abort();
  }, []);

  function show(list: AddressSuggestion[]) {
    setSuggestions(list);
    setActive(-1);
    setOpen(list.length > 0);
    setBusy(false);
    setMessage(list.length === 0 ? "Tokio adreso rasti nepavyko. Pabandykite trumpiau arba pridėkite miestą." : "");
  }

  async function load(text: string) {
    const current = new AbortController();
    controller.current = current;
    try {
      const response = await fetch(`/api/address-search?q=${encodeURIComponent(text)}`, {
        signal: current.signal,
      });
      if (!response.ok) throw new Error(String(response.status));
      const list = (await response.json()) as AddressSuggestion[];

      const key = text.toLowerCase();
      cache.current.set(key, list);
      // Seniausias įrašas iškeliamas pirmas: Map išlaiko įdėjimo tvarką.
      if (cache.current.size > CACHE_LIMIT) cache.current.delete(cache.current.keys().next().value as string);
      show(list);
    } catch {
      // Nutraukta užklausa nieko nerodo: jos vietą jau užėmė naujesnė.
      if (current.signal.aborted) return;
      setBusy(false);
      setMessage("Nepavyko pasiekti adresų paieškos.");
    }
  }

  function onType(next: string) {
    // Pakeitus tekstą pasirinkimas nebegalioja – kitaip maršrutas eitų
    // į seną tašką, o laukelyje būtų matyti naujas adresas.
    onChange(next, "");
    setMessage("");
    pick.current += 1;
    clearTimeout(timer.current);
    controller.current?.abort();

    const text = next.trim();
    if (!enabled || text.length < MIN_ADDRESS_QUERY) {
      setSuggestions([]);
      setOpen(false);
      setBusy(false);
      return;
    }

    // „FR51“: per mažai, kad pasakytume kodą ir miestą – geriau paprašyti daugiau nei rodyti spėjimus.
    if (parsePostalQuery(text)?.partial) {
      setSuggestions([]);
      setOpen(false);
      setBusy(false);
      setMessage(`Pašto kodas per trumpas: įveskite bent ${MIN_POSTAL_DIGITS} skaitmenis, pvz. FR-51100.`);
      return;
    }

    const cached = cache.current.get(text.toLowerCase());
    if (cached) {
      show(cached);
      return;
    }

    setBusy(true);
    timer.current = setTimeout(() => void load(text), DEBOUNCE_MS);
  }

  async function choose(suggestion: AddressSuggestion) {
    const id = ++pick.current;
    setOpen(false);
    setSuggestions([]);
    setBusy(true);
    setMessage("");

    const place = await resolveAddress(suggestion.searchText);
    if (id !== pick.current) return;

    setBusy(false);
    if (!place) {
      setMessage("Nepavyko nustatyti adreso vietos. Pabandykite kitą pasiūlymą.");
      return;
    }
    onChange(place.formattedAddress || suggestion.caption, `${place.latitude},${place.longitude}`);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!enabled) return;

    if (event.key === "Enter") {
      // Enter laukelyje reikštų formos pateikimą; čia jis renka pasiūlymą.
      event.preventDefault();
      if (open && suggestions[active]) void choose(suggestions[active]);
    } else if (event.key === "ArrowDown" && suggestions.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActive((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp" && suggestions.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActive((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  const expanded = open && suggestions.length > 0;

  return (
    <div className="relative flex flex-col gap-2">
      <label className="block">
        {label}
        <input
          name={name}
          type="text"
          value={query}
          autoComplete="off"
          role={enabled ? "combobox" : undefined}
          aria-expanded={enabled ? expanded : undefined}
          aria-controls={enabled ? listId : undefined}
          aria-autocomplete={enabled ? "list" : undefined}
          aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
          onChange={(event) => onType(event.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setOpen(suggestions.length > 0)}
          onBlur={() => setOpen(false)}
          className={inputClass}
        />
      </label>

      {enabled && (busy || point || message) && (
        <div className="flex flex-wrap items-center gap-3 text-sm" aria-live="polite">
          {busy && <span className="text-muted">Ieškoma…</span>}
          {!busy && point && <span className="text-good">Adresas patvirtintas</span>}
          {!busy && message && <span className="text-muted">{message}</span>}
        </div>
      )}

      {expanded && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-lg border bg-surface shadow-lg"
        >
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion.searchText}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              // Paspaudimas neturi atimti fokuso iš lauko, kitaip `onBlur`
              // uždarytų sąrašą anksčiau, nei suveiktų `onClick`.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void choose(suggestion)}
              className={`cursor-pointer px-3 py-2 text-left text-sm ${index === active ? "bg-raised" : "hover:bg-raised"}`}
            >
              <span className="block">{suggestion.caption}</span>
              {suggestion.subCaption && (
                <span className="block text-xs text-muted">{suggestion.subCaption}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {name && <input type="hidden" name={`${name}_point`} value={point} />}
    </div>
  );
}
