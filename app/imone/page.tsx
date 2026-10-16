import type { Metadata } from "next";
import { connection } from "next/server";

import {
  pendingInvitations,
  type CompanyInvitation,
  type CompanyMember,
} from "@/lib/invitations";
import { fetchCompanySettings } from "@/lib/company-settings";
import { createServerSupabaseClient } from "@/lib/supabase-server";

import { Page, PageHeader } from "../ui";
import { saveMinMargin, savePerDiemPercent } from "./actions";
import { InvitationRowActions } from "./invitation-row-actions";
import { InviteForm } from "./invite-form";
import { SettingForm } from "./setting-form";

export const metadata: Metadata = {
  title: "Įmonė | Bramit",
};

function formatDate(value: string): string {
  return value.slice(0, 10);
}

export default async function ImonePage() {
  // Sąrašas keičiasi, todėl puslapis generuojamas kiekvienai užklausai.
  await connection();

  const supabase = await createServerSupabaseClient();

  const [memberResult, inviteResult, settings] = await Promise.all([
    supabase
      .from("company_member_emails")
      .select("user_id,email,role,created_at")
      .order("created_at")
      .overrideTypes<CompanyMember[], { merge: false }>(),
    supabase
      .from("company_invitations")
      .select("email,invited_at,accepted_at")
      .overrideTypes<CompanyInvitation[], { merge: false }>(),
    fetchCompanySettings(supabase),
  ]);

  const members = memberResult.data ?? [];
  const waiting = pendingInvitations(inviteResult.data ?? []);

  return (
    <Page width="narrow">
      <PageHeader
        title="Įmonė"
        description="Visi įmonės nariai mato tuos pačius reisus, furas ir skaičius. Kitų įmonių duomenys lieka nematomi."
      />
      <div className="mt-6 flex flex-col gap-10">

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Minimali marža</h2>
        <p className="text-sm text-muted">
          Reisas, kurio marža žemesnė, skaičiuoklėje ir reisų sąraše pažymimas įspėjimu, o
          skaičiuoklė parodo kainą, kuri ribą pasiektų. Marža skaičiuojama nuo pajamų. Palikite
          tuščią, jei ribos nereikia. Keisti gali tik savininkas.
        </p>
        <SettingForm
          name="min_margin_percent"
          label="Minimali marža, %"
          placeholder="pvz. 12"
          current={settings.minMarginPercent}
          action={saveMinMargin}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Dienpinigiai pagal šalis</h2>
        <p className="text-sm text-muted">
          Įjungus, reiso dienpinigiai skaičiuojami pagal šalis, kuriose fura kiekvieną dieną
          važiuoja (iš PTV maršruto), ir pakeičia furos fiksuotą dienpinigių sumą. Normos – LRV
          nutarimo Nr. 526 (nuo 2026-10-01). Įrašykite, kiek normos mokate: 100 %, o jei
          kolektyvinė sutartis numato mažiau – ne mažiau kaip 50 %. Tuščia – išjungta.
        </p>
        <SettingForm
          name="per_diem_percent"
          label="Mokama normos dalis, %"
          placeholder="pvz. 100"
          current={settings.perDiemPercent}
          action={savePerDiemPercent}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Turi prieigą</h2>
        {memberResult.error ? (
          <p role="alert" className="text-sm text-bad">
            Nepavyko nuskaityti narių: {memberResult.error.message}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left ">
                  <th className="py-2 pr-4 font-medium">El. paštas</th>
                  <th className="py-2 pr-4 font-medium">Teisės</th>
                  <th className="py-2 font-medium">Nuo</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr
                    key={member.user_id}
                    className="border-b border-line "
                  >
                    <td className="py-2 pr-4">{member.email}</td>
                    <td className="py-2 pr-4">
                      {member.role === "owner" ? "Savininkas" : "Darbuotojas"}
                    </td>
                    <td className="py-2 tabular-nums">{formatDate(member.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Laukia registracijos</h2>
        {inviteResult.error ? (
          <p role="alert" className="text-sm text-bad">
            Nepavyko nuskaityti pakvietimų: {inviteResult.error.message}
          </p>
        ) : waiting.length === 0 ? (
          <p className="text-sm text-muted">Laukiančių pakvietimų nėra.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {waiting.map((invitation) => (
              <li
                key={invitation.email}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-2 text-sm "
              >
                <span>
                  {invitation.email}
                  <span className="ml-2 text-xs text-muted">
                    pakviesta {formatDate(invitation.invited_at)}
                  </span>
                </span>
                <InvitationRowActions email={invitation.email} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">Pakviesti darbuotoją</h2>
        <p className="text-sm text-muted">
          Laiško nesiunčiame. Įrašykite adresą ir pasakykite žmogui užsiregistruoti tuo pačiu
          el. paštu – tada jis iškart pateks į šią įmonę, o ne į tuščią erdvę.
        </p>
        <InviteForm />
      </section>
      </div>
    </Page>
  );
}
