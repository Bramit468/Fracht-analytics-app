import { describe, expect, it } from "vitest";

import { parseEcbRates, rateFor, toEuroCents } from "./ecb-rates";

/** Sutrumpinta ECB atsakymo kopija: penktadienis ir prieš tai buvęs ketvirtadienis. */
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01">
  <Cube>
    <Cube time='2026-09-18'>
      <Cube currency='USD' rate='1.0812'/>
      <Cube currency='NOK' rate='11.7025'/>
      <Cube currency='SEK' rate='11.1580'/>
    </Cube>
    <Cube time='2026-09-17'>
      <Cube currency='USD' rate='1.0790'/>
      <Cube currency='NOK' rate='11.6500'/>
    </Cube>
  </Cube>
</gesmes:Envelope>`;

describe("parseEcbRates", () => {
  it("nuskaito dienas ir valiutas", () => {
    expect(parseEcbRates(XML)).toEqual({
      "2026-09-18": { USD: 1.0812, NOK: 11.7025, SEK: 11.158 },
      "2026-09-17": { USD: 1.079, NOK: 11.65 },
    });
  });

  it("tuščias ar nesuprantamas atsakymas duoda tuščią lentelę, o ne klaidą", () => {
    // Kursų nebuvimas neturi griauti puslapio: be jų tiesiog nekonvertuojama.
    expect(parseEcbRates("")).toEqual({});
    expect(parseEcbRates("<html>klaida</html>")).toEqual({});
  });
});

describe("rateFor", () => {
  const rates = parseEcbRates(XML);

  it("eurui kurso nereikia", () => {
    expect(rateFor(rates, "EUR", "2026-09-18")).toBe(1);
  });

  it("ima tos dienos kursą", () => {
    expect(rateFor(rates, "NOK", "2026-09-18")).toBe(11.7025);
  });

  it("savaitgalio pirkimas gauna penktadienio kursą", () => {
    // ECB savaitgaliais kurso neskelbia. Šeštadienis ir sekmadienis turi imti
    // penktadienį, o ne kitos savaitės pirmadienį ar šiandienos kursą.
    expect(rateFor(rates, "NOK", "2026-09-19")).toBe(11.7025);
    expect(rateFor(rates, "NOK", "2026-09-20")).toBe(11.7025);
  });

  it("valiutos, kurios tą dieną nebuvo, ieško anksčiau", () => {
    expect(rateFor(rates, "SEK", "2026-09-19")).toBe(11.158);
    // SEK ketvirtadienį neskelbtas, o anksčiau nieko nėra.
    expect(rateFor(rates, "SEK", "2026-09-17")).toBeNull();
  });

  it("pirkimas anksčiau už visus turimus kursus lieka be kurso", () => {
    expect(rateFor(rates, "NOK", "2026-09-16")).toBeNull();
  });

  it("nežinoma valiuta lieka be kurso", () => {
    expect(rateFor(rates, "PLN", "2026-09-18")).toBeNull();
  });
});

describe("toEuroCents", () => {
  const rates = parseEcbRates(XML);

  it("kronos verčiamos į centus", () => {
    // 480 NOK / 11.7025 = 41,0170… EUR
    expect(toEuroCents(rates, 480, "NOK", "2026-09-18")).toBe(4102);
  });

  it("eurai lieka tokie patys", () => {
    expect(toEuroCents(rates, 344.14, "EUR", "2026-09-18")).toBe(34414);
  });

  it("neigiama suma verčiama su ženklu", () => {
    // Grąžinimai ir PVM korekcijos ateina minusu (#49).
    expect(toEuroCents(rates, -480, "NOK", "2026-09-18")).toBe(-4102);
  });

  it("be kurso grąžina null, o ne spėjimą", () => {
    expect(toEuroCents(rates, 100, "PLN", "2026-09-18")).toBeNull();
  });
});
