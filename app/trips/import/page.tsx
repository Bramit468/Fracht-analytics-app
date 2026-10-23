import { Page, PageHeader } from "../../ui";
import { ExcelImport } from "./excel-import";
import { TelematikaImport } from "./telematika-import";

export default function ImportTripsPage() {
  return <Page>
    <PageHeader title="Importas" description="Užsakymai iš Telematikos arba reisai iš Excel failo." />
    <section className="mt-5 rounded-lg border border-line bg-surface p-5 sm:p-6">
      <h2 className="font-semibold">Iš Telematikos</h2>
      <p className="mt-1 mb-4 text-sm text-muted">
        Užsakymai su atkarpomis, kainomis ir faktiniais keliais bei kuru. Telematika duoda paskutinį mėnesį –
        atnaujinkite bent kas kelias savaites. Įrašomi tik nauji ir pakitę užsakymai, nepakitę neliečiami.
      </p>
      <TelematikaImport />
    </section>
    <section className="mt-5 rounded-lg border border-line bg-surface p-5 sm:p-6">
      <h2 className="mb-4 font-semibold">Iš Excel</h2>
      <ExcelImport />
    </section>
  </Page>;
}
