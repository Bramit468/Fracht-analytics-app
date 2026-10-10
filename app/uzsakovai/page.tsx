import type { Metadata } from "next";

import { CustomerReport } from "./customer-report";

export const metadata: Metadata = {
  title: "Užsakovai | Bramit",
};

export default function CustomersPage() {
  return <main className="px-4 py-8">
    <div className="mx-auto max-w-5xl">
      <h1 className="text-3xl font-semibold">Užsakovai</h1>
      <p className="mt-1 text-sm text-muted">
        Kuris klientas uždirba daugiausia, o kuris tik užima furas. Užsakovas priskiriamas reiso
        formoje.
      </p>
      <div className="mt-6"><CustomerReport /></div>
    </div>
  </main>;
}
