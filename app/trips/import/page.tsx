import { Page, PageHeader } from "../../ui";
import { ExcelImport } from "./excel-import";

export default function ImportTripsPage() {
  return <Page>
    <PageHeader title="Importas iš Excel" description="Įkelkite .xlsx failą, priskirkite stulpelius, peržiūrėkite eilutes ir importuokite tinkamus reisus." />
    <div className="mt-5 rounded-lg border border-line bg-surface p-5 sm:p-6"><ExcelImport /></div>
  </Page>;
}
