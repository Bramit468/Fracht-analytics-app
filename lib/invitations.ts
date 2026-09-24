/**
 * Pakvietimai į įmonę (#97).
 *
 * Registracijos metu naudotojas priskiriamas įmonei pagal el. paštą, todėl
 * adresas turi būti toks pat, kokį jį laiko Supabase Auth: be tarpų ir
 * mažosiomis raidėmis. Tą patį reikalauja ir lentelės `check`, tik ten klaida
 * atrodytų kaip Postgres pranešimas, o ne kaip paaiškinimas žmogui.
 */

export interface CompanyInvitation {
  email: string;
  invited_at: string;
  accepted_at: string | null;
}

export interface CompanyMember {
  user_id: string;
  email: string;
  role: string;
  created_at: string;
}

export type ParsedEmail = { ok: true; email: string } | { ok: false; error: string };

/** Toks pavidalas, kokiu adresą laiko Auth: be tarpų, mažosiomis. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Patikrina pakvietimo adresą.
 *
 * Tikrinama tik tai, kas tikrai klaidinga: visų galiojančių adresų taisyklės
 * yra sudėtingesnės, nei verta, o tikrasis patikrinimas vis tiek įvyksta tada,
 * kai žmogus tuo adresu užsiregistruoja.
 */
export function parseInviteEmail(raw: string): ParsedEmail {
  const email = normalizeEmail(raw);

  if (email === "") {
    return { ok: false, error: "Įrašykite el. paštą." };
  }

  const parts = email.split("@");

  if (parts.length !== 2 || parts[0] === "" || parts[1] === "") {
    return { ok: false, error: "El. paštas turi būti pavidalo vardas@imone.lt." };
  }

  if (/\s/.test(email)) {
    return { ok: false, error: "El. pašte negali būti tarpų." };
  }

  if (!parts[1].includes(".") || parts[1].startsWith(".") || parts[1].endsWith(".")) {
    return { ok: false, error: "Patikrinkite srities dalį po „@“." };
  }

  return { ok: true, email };
}

/** Ar tas adresas jau turi prieigą — pakartotinai kviesti nėra ko. */
export function isAlreadyMember(members: CompanyMember[], email: string): boolean {
  const wanted = normalizeEmail(email);
  return members.some((member) => normalizeEmail(member.email) === wanted);
}

/**
 * Laukiantys pakvietimai, naujausi viršuje.
 *
 * Priimti pakvietimai lieka lentelėje kaip istorija, bet sąraše jų rodyti
 * nereikia: tie žmonės jau matomi tarp narių.
 */
export function pendingInvitations(rows: CompanyInvitation[]): CompanyInvitation[] {
  return rows
    .filter((row) => row.accepted_at === null)
    .sort((a, b) => b.invited_at.localeCompare(a.invited_at));
}
