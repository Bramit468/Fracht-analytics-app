import type { Metadata } from "next";
import { connection } from "next/server";

import {
  pendingInvitations,
  type CompanyInvitation,
  type CompanyMember,
} from "@/lib/invitations";
import { fetchCompanySettings } from "@/lib/company-settings";
import { createServerSupabaseClient } from "@/lib/supabase-server";

import { Page, PageHeader, SettingRow } from "../ui";
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
    <Page>
      <PageHeader
        title="Įmonė"
        description="Visi įmonės nariai mato tuos pačius reisus, furas ir skaičius. Kitų įmonių duomenys lieka nematomi."
      />
      <div className="mt-2">
        <SettingRow
          title="Minimali marža"
          description="Reisas su žemesne marža pažymimas skaičiuoklėje ir reisų sąraše, o skaičiuoklė parodo kainą, kuri ribą pasiektų. Marža – nuo pajamų. Tuščia – ribos nėra. Keisti gali tik savininkas."
        >
          <SettingForm
            name="min_margin_percent"
            label="Minimali marža, %"
            placeholder="pvz. 12"
            current={settings.minMarginPercent}
            action={saveMinMargin}
          />
        </SettingRow>

        <SettingRow
          title="Dienpinigiai pagal šalis"
          description="Skaičiuojami pagal šalis, kuriose fura važiuoja kiekvieną dieną (iš PTV maršruto), vietoj furos fiksuotos sumos. Normos – LRV nutarimo Nr. 526 (nuo 2026-10-01). Įrašykite mokamą normos dalį: 100 %, pagal kolektyvinę sutartį – ne mažiau kaip 50 %. Tuščia – išjungta."
        >
          <SettingForm
            name="per_diem_percent"
            label="Mokama normos dalis, %"
            placeholder="pvz. 100"
            current={settings.perDiemPercent}
            action={savePerDiemPercent}
          />
        </SettingRow>

        <SettingRow title="Turi prieigą">
          {memberResult.error ? (
            <p role="alert" className="text-sm text-bad">
              Nepavyko nuskaityti narių: {memberResult.error.message}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-line bg-surface">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="py-2.5 pl-4 pr-4 font-medium">El. paštas</th>
                    <th className="py-2.5 pr-4 font-medium">Teisės</th>
                    <th className="py-2.5 pr-4 font-medium">Nuo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {members.map((member) => (
                    <tr key={member.user_id}>
                      <td className="py-2.5 pl-4 pr-4">{member.email}</td>
                      <td className="py-2.5 pr-4 text-muted">
                        {member.role === "owner" ? "Savininkas" : "Darbuotojas"}
                      </td>
                      <td className="py-2.5 pr-4 tabular-nums text-muted">{formatDate(member.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SettingRow>

        <SettingRow title="Laukia registracijos">
          {inviteResult.error ? (
            <p role="alert" className="text-sm text-bad">
              Nepavyko nuskaityti pakvietimų: {inviteResult.error.message}
            </p>
          ) : waiting.length === 0 ? (
            <p className="text-sm text-muted">Laukiančių pakvietimų nėra.</p>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
              {waiting.map((invitation) => (
                <li
                  key={invitation.email}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm"
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
        </SettingRow>

        <SettingRow
          title="Pakviesti darbuotoją"
          description="Laiško nesiunčiame. Įrašykite adresą ir pasakykite žmogui užsiregistruoti tuo pačiu el. paštu – tada jis iškart pateks į šią įmonę. Kviesti ir atšaukti kvietimus gali tik savininkas."
        >
          <InviteForm />
        </SettingRow>
      </div>
    </Page>
  );
}
