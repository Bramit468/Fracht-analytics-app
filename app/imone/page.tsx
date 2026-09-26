import type { Metadata } from "next";
import { connection } from "next/server";

import {
  pendingInvitations,
  type CompanyInvitation,
  type CompanyMember,
} from "@/lib/invitations";
import { createServerSupabaseClient } from "@/lib/supabase-server";

import { AppNav } from "../app-nav";
import { InvitationRowActions } from "./invitation-row-actions";
import { InviteForm } from "./invite-form";

export const metadata: Metadata = {
  title: "Įmonė | Fracht Analytics",
};

function formatDate(value: string): string {
  return value.slice(0, 10);
}

export default async function ImonePage() {
  // Sąrašas keičiasi, todėl puslapis generuojamas kiekvienai užklausai.
  await connection();

  const supabase = await createServerSupabaseClient();

  const [memberResult, inviteResult] = await Promise.all([
    supabase
      .from("company_member_emails")
      .select("user_id,email,role,created_at")
      .order("created_at")
      .overrideTypes<CompanyMember[], { merge: false }>(),
    supabase
      .from("company_invitations")
      .select("email,invited_at,accepted_at")
      .overrideTypes<CompanyInvitation[], { merge: false }>(),
  ]);

  const members = memberResult.data ?? [];
  const waiting = pendingInvitations(inviteResult.data ?? []);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-10">
      <AppNav />
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Įmonė</h1>
        <p className="text-sm text-neutral-500">
          Visi įmonės nariai mato tuos pačius reisus, furas ir skaičius. Kitų įmonių duomenys
          lieka nematomi.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Turi prieigą</h2>
        {memberResult.error ? (
          <p role="alert" className="text-sm text-red-600">
            Nepavyko nuskaityti narių: {memberResult.error.message}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-300 text-left dark:border-neutral-700">
                  <th className="py-2 pr-4 font-medium">El. paštas</th>
                  <th className="py-2 pr-4 font-medium">Teisės</th>
                  <th className="py-2 font-medium">Nuo</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr
                    key={member.user_id}
                    className="border-b border-neutral-200 dark:border-neutral-800"
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
          <p role="alert" className="text-sm text-red-600">
            Nepavyko nuskaityti pakvietimų: {inviteResult.error.message}
          </p>
        ) : waiting.length === 0 ? (
          <p className="text-sm text-neutral-500">Laukiančių pakvietimų nėra.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {waiting.map((invitation) => (
              <li
                key={invitation.email}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 py-2 text-sm dark:border-neutral-800"
              >
                <span>
                  {invitation.email}
                  <span className="ml-2 text-xs text-neutral-500">
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
        <p className="text-sm text-neutral-500">
          Laiško nesiunčiame. Įrašykite adresą ir pasakykite žmogui užsiregistruoti tuo pačiu
          el. paštu — tada jis iškart pateks į šią įmonę, o ne į tuščią erdvę.
        </p>
        <InviteForm />
      </section>
    </main>
  );
}
