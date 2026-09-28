import type { Metadata } from "next";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Prisijungimas | Fracht Analytics",
};

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-page px-4 py-10">
      <section className="w-full max-w-md rounded-3xl bg-surface p-7 shadow-2xl sm:p-9">
        <div className="mb-8">
          <span className="grid size-12 place-items-center rounded-2xl bg-accent text-xl font-black text-accent-ink">
            F
          </span>
          <p className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-accent">
            Fracht Analytics
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink">
            Prisijunkite
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            Reisų pajamos, kaštai ir pelningumas vienoje vietoje.
          </p>
        </div>
        <LoginForm />
      </section>
    </main>
  );
}
