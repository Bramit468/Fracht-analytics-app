import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  findDates,
  findMoney,
  findWeightsKg,
  mergeOffer,
  needsAi,
  offerSummary,
  offerWarnings,
  parseLooseNumber,
  parseOffer,
  parsePlace,
  placeQuery,
  validateAiOffer,
  type OfferFields,
} from "./offer-parse";

const TODAY = "2026-10-31";
const DIR = path.join(__dirname, "__fixtures__", "offers");
const fixtures = fs.readdirSync(DIR).filter((name) => name.endsWith(".txt")).sort();

/** Laukai, kurių fixture neturi, turi likti tušti – kitaip parseris kažką išgalvojo. */
const OPTIONAL = ["loadingTime", "ldm", "pallets"] as const;

describe("parseOffer su pavyzdžiais", () => {
  it.each(fixtures)("%s", (name) => {
    const text = fs.readFileSync(path.join(DIR, name), "utf8");
    const expected = JSON.parse(fs.readFileSync(path.join(DIR, name.replace(".txt", ".json")), "utf8")) as Partial<OfferFields>;
    const { fields } = parseOffer(text, TODAY);

    for (const [key, value] of Object.entries(expected)) {
      expect(fields[key as keyof OfferFields], key).toEqual(value);
    }
    for (const key of OPTIONAL) {
      if (!(key in expected)) expect(fields[key], key).toBeNull();
    }
  });

  it("visiems pavyzdžiams AI nereikia", () => {
    const needing = fixtures.filter((name) => needsAi(parseOffer(fs.readFileSync(path.join(DIR, name), "utf8"), TODAY)));
    expect(needing).toEqual([]);
  });
});

describe("skaitytuvai", () => {
  it("skaičiai su skirtukais", () => {
    expect(parseLooseNumber("1,450")).toBe(1450);
    expect(parseLooseNumber("1.250,00")).toBe(1250);
    expect(parseLooseNumber("1 430")).toBe(1430);
    expect(parseLooseNumber("1,980.00")).toBe(1980);
    expect(parseLooseNumber("12.5")).toBe(12.5);
    expect(parseLooseNumber("16,8")).toBe(16.8);
    expect(parseLooseNumber("22.000")).toBe(22000);
    expect(parseLooseNumber("abc")).toBeNull();
  });

  it("sumos su valiuta, paletės – ne kaina", () => {
    expect(findMoney("Price: €980")).toEqual([{ amount: 980, currency: "EUR" }]);
    expect(findMoney("Stawka: 4 200 zł")).toEqual([{ amount: 4200, currency: "PLN" }]);
    expect(findMoney("Pallets: 24 EUR pallets")).toEqual([]);
  });

  it("svoris kilogramais, ne vilkiko masė", () => {
    expect(findWeightsKg("Weight: 12.5 t")).toEqual([12500]);
    expect(findWeightsKg("Svoris: 21 000 kg")).toEqual([21000]);
    expect(findWeightsKg("Truck: 40 t, gross 44 t")).toEqual([40000]);
  });

  it("datos: be metų – artimiausi ateities metai, žodžiai – nuo šiandien", () => {
    expect(findDates("Loading 02.11. 08:00", TODAY)).toEqual([{ date: "2026-11-02", time: "08:00" }]);
    expect(findDates("Ladedatum 05.01.", TODAY)).toEqual([{ date: "2027-01-05", time: null }]);
    expect(findDates("Pickup tomorrow, delivery 31.02.2026", TODAY)).toEqual([{ date: "2026-11-01", time: null }]);
  });

  it("mėnuo žodžiu – keturiomis kalbomis", () => {
    expect(findDates("iš Vilniaus lapkričio 5 d., 2 paletės", TODAY).map((row) => row.date)).toEqual(["2026-11-05"]);
    expect(findDates("Loading 5 November 2026 at 8:30", TODAY)).toEqual([{ date: "2026-11-05", time: "08:30" }]);
    expect(findDates("Abholung 3. Dezember", TODAY).map((row) => row.date)).toEqual(["2026-12-03"]);
    expect(findDates("Załadunek 4 stycznia", TODAY).map((row) => row.date)).toEqual(["2027-01-04"]);
    expect(findDates("2 Entladestellen, 30 days, 24 EUR pallets", TODAY)).toEqual([]);
  });

  it("vietos įvairiais formatais", () => {
    expect(parsePlace("LT-49400 Kaunas, Lithuania")).toEqual({ country: "LT", postalCode: "49400", city: "Kaunas" });
    expect(parsePlace("Breda (NL), ZIP 4815")).toEqual({ country: "NL", postalCode: "4815", city: "Breda" });
    expect(parsePlace("Hamburg, Germany")).toEqual({ country: "DE", postalCode: null, city: "Hamburg" });
    expect(parsePlace("8.2 LDM")).toBeNull();
    expect(placeQuery({ country: "LT", postalCode: "49400", city: "Kaunas" })).toBe("49400 Kaunas, LT");
  });
});

describe("ne eurai ir trūkstami laukai", () => {
  it("kita valiuta neperskaičiuojama ir apie ją pasakoma", () => {
    const { fields } = parseOffer("From: DE-20457 Hamburg\nTo: SE-41101 Göteborg\nLoading: 03.11.2026\nPrice: 9 500 SEK", TODAY);
    expect(fields.priceCents).toBeNull();
    expect(fields.currency).toBe("SEK");
    expect(offerWarnings(fields)).toContain("Kaina nurodyta SEK – neperskaičiuota į eurus, įveskite kainą eurais.");
  });

  it("be adresų reikia AI, neperskaitytos eilutės grąžinamos", () => {
    const offer = parseOffer("Hamburg nach Kaunas, Abholung morgen, 1200 EUR", TODAY);
    expect(needsAi(offer)).toBe(true);
    expect(offer.fields.priceCents).toBe(120000);
    expect(offer.fields.loadingDate).toBe("2026-11-01");
    expect(offer.unparsed).toEqual(["Hamburg nach Kaunas, Abholung morgen, 1200 EUR"]);
  });
});

describe("AI atsakymo patikra", () => {
  const text = "Hamburg nach Kaunas (LT 44001), Abholung 03.11.2026 08:00, 22 t, 1.200 EUR";

  it("priima tai, kas yra tekste", () => {
    const fields = validateAiOffer({
      source: "unknown",
      loading: { country: "DE", postalCode: null, city: "Hamburg" },
      unloading: { country: "LT", postalCode: "44001", city: "Kaunas" },
      extraStops: [],
      loadingDate: "2026-11-03", loadingTime: "08:00", unloadingDate: null,
      price: 1200, currency: "EUR", weightKg: 22000, ldm: null, pallets: null,
    }, text, TODAY);
    expect(fields).toMatchObject({
      loading: { city: "Hamburg", country: "DE" },
      unloading: { city: "Kaunas", postalCode: "44001" },
      loadingDate: "2026-11-03", loadingTime: "08:00", priceCents: 120000, currency: "EUR", weightKg: 22000,
    });
  });

  it("išmeta išgalvotus: miestą, datą, kainą ir svorį, kurių tekste nėra", () => {
    const fields = validateAiOffer({
      loading: { country: "DE", postalCode: "20457", city: "Bremen" },
      unloading: { country: "LT", postalCode: "99999", city: "Kaunas" },
      loadingDate: "2026-11-04", price: 1250, currency: "EUR", weightKg: 24000, pallets: 33,
    }, text, TODAY);
    expect(fields.loading).toBeNull();
    expect(fields.unloading).toEqual({ country: "LT", postalCode: null, city: "Kaunas" });
    expect(fields.loadingDate).toBeNull();
    expect(fields.priceCents).toBeNull();
    expect(fields.weightKg).toBeNull();
    expect(fields.pallets).toBeNull();
  });

  it("linksnis: „iš Vilniaus į Rygą“ – Vilnius ir Ryga; pakartotas galas – ne papildomas sustojimas", () => {
    const lt = "Reikia mašinos iš Vilniaus į Rygą, iškrovimas ir Jelgavoje, kaina 450 eurų";
    const fields = validateAiOffer({
      loading: { country: "LT", postalCode: null, city: "Vilnius" },
      unloading: { country: "LV", postalCode: null, city: "Ryga" },
      extraStops: [
        { kind: "unloading", place: { country: "LV", postalCode: null, city: "Jelgava" } },
        { kind: "unloading", place: { country: "LV", postalCode: null, city: "Ryga" } },
      ],
    }, lt, TODAY);
    expect(fields.loading?.city).toBe("Vilnius");
    expect(fields.unloading?.city).toBe("Ryga");
    expect(fields.extraStops.map((stop) => stop.place.city)).toEqual(["Jelgava"]);
  });

  it("netinkamas atsakymas – tušti laukai", () => {
    expect(validateAiOffer("ne objektas", text, TODAY).loading).toBeNull();
  });

  it("sujungimas: taisyklių rasta lieka, AI papildo", () => {
    const rules = parseOffer(text, TODAY).fields;
    const ai = validateAiOffer({
      loading: { country: "DE", postalCode: null, city: "Hamburg" },
      unloading: { country: "LT", postalCode: "44001", city: "Kaunas" },
      loadingDate: "2026-11-03", price: 1200, currency: "EUR", weightKg: 22000,
    }, text, TODAY);
    const { fields, fromAi } = mergeOffer(rules, ai);
    // Svoris be „kg“ taisyklėms neaiškus („24t curtainsider“ – vilkikas), todėl jį duoda AI.
    expect(fromAi).toEqual(["loading", "unloading", "weightKg"]);
    expect(fields.priceCents).toBe(120000);
    expect(offerSummary(fields, fromAi.length > 0)).toBe("Užpildyta: Hamburg → Kaunas, 11-03 08:00, 1 200 €, 22 t (AI).");
  });
});
