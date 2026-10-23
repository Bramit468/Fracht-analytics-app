import type { Metadata } from "next";

import { Page, PageHeader } from "../ui";
import { CustomerReport } from "./customer-report";

export const metadata: Metadata = {
  title: "Užsakovai | Bramit",
};

export default function CustomersPage() {
  return <Page>
    <PageHeader title="Užsakovai" description="Pelnas pagal užsakovą. Užsakovas priskiriamas reiso formoje." />
    <div className="mt-5"><CustomerReport /></div>
  </Page>;
}
