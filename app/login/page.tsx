import type { Metadata } from "next";

import { BrandMark } from "../brand-mark";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Prisijungimas | Bramit",
};

/**
 * Prisijungimas (#205): kairėje – tamsi juosta su ženklu, kaip programos
 * šonas, dešinėje – forma. Be didelės kortelės su šešėliu ir be šūkių.
 */
export default function LoginPage() {
  return (
    <main className="grid min-h-screen bg-surface lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <section className="hidden flex-col justify-between bg-sidebar p-10 text-sidebar-ink lg:flex">
        <div className="flex items-center gap-2.5">
          <BrandMark />
          <span className="text-[15px] font-semibold tracking-tight">Bramit</span>
        </div>
        <div className="max-w-sm">
          <p className="text-2xl font-semibold leading-snug tracking-tight">
            Kiek uždirba kiekvienas reisas – prieš išvažiuojant ir grįžus.
          </p>
          <p className="mt-3 text-sm text-sidebar-muted">
            Kaštai pagal furą, maršrutą ir telematiką. Pelnas, marža ir pelnas per parą.
          </p>
        </div>
        <p className="text-xs text-sidebar-muted">© Bramit</p>
      </section>

      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <BrandMark />
            <span className="text-[15px] font-semibold tracking-tight">Bramit</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Prisijungimas</h1>
          <p className="mt-1 text-sm text-muted">Prieigą prie įmonės paskyros suteikia administratorius.</p>
          <div className="mt-8">
            <LoginForm />
          </div>
        </div>
      </section>
    </main>
  );
}
