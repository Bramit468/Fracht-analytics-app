"use server";

import {
  parseCanDaily,
  parseSupplies,
  plateKey,
  summarizeActuals,
  tripFillFromActuals,
  type SkippedSupply,
  type TripFill,
} from "@/lib/telematics-costs";
import { fetchEcbRates, toEuroCents } from "@/lib/ecb-rates";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export type TelematicsFillResult =
  | {
      ok: true;
      fill: TripFill;
      km: number;
      tollCents: number;
      /** Valiutos, kuriomis pirkta ir kurios į sumas nepateko. Tuščia – viskas eurais. */
      skippedCurrencies: string[];
      skippedRows: number;
    }
  | { ok: false; message: string };

async function fetchJson(url: string | undefined): Promise<unknown> {
  if (!url) throw new Error("Nenurodytas adresas");
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
}

/**
 * Faktiniai furos duomenys reiso formai (#44).
 *
 * Užklausa eina iš serverio, nes nuorodose yra prieigos raktas — į naršyklę
 * jis patekti negali. Prisijungimas tikrinamas ir čia: server action pasiekiama
 * adresu, o ne tik per mygtuką.
 */
export async function fetchTelematicsFill(
  plate: string,
  from: string,
  to: string,
): Promise<TelematicsFillResult> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    return { ok: false, message: "Prisijunkite iš naujo." };
  }

  if (!plate || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return { ok: false, message: "Pasirinkite furą ir abi datas." };
  }
  if (from > to) {
    return { ok: false, message: "Pabaigos data negali būti anksčiau už pradžios." };
  }

  let costs;
  let skipped: SkippedSupply[] = [];
  try {
    const [canRaw, suppliesRaw, rates] = await Promise.all([
      fetchJson(process.env.TELEMATIKA_CANDAILY_URL),
      fetchJson(process.env.TELEMATIKA_SUPPLIES_URL),
      fetchEcbRates(),
    ]);
    const { supplies, issues } = parseSupplies(suppliesRaw, (amount, currency, date) =>
      toEuroCents(rates, amount, currency, date),
    );
    costs = summarizeActuals(parseCanDaily(canRaw), supplies, plate, from, to);

    // Ne eurais pirkti kuras ir keliai į sumas nepatenka. Lentelėje tai matyti,
    // o čia suma įrašoma į reisą, todėl tylėti negalima: Norvegijos reisas
    // gautų „keliai 0,00 €" ir atrodytų pelningesnis, nei yra (#56).
    const wanted = plateKey(plate);
    skipped = issues.otherCurrency.filter(
      (row) =>
        row.plate !== null &&
        plateKey(row.plate) === wanted &&
        row.date !== null &&
        row.date >= from &&
        row.date <= to,
    );
  } catch {
    return { ok: false, message: "Nepavyko gauti telematikos duomenų." };
  }

  if (costs.km <= 0) {
    // Dažniausia priežastis – furos numeris sąraše nesutampa su telematikos.
    return {
      ok: false,
      message: `Fura ${plate} per tą laikotarpį nevažiavo. Patikrinkite numerį ir datas.`,
    };
  }

  return {
    ok: true,
    fill: tripFillFromActuals(costs),
    km: costs.km,
    tollCents: costs.tollCents,
    skippedCurrencies: [...new Set(skipped.map((row) => row.currency).filter(Boolean))].sort(),
    skippedRows: skipped.length,
  };
}
