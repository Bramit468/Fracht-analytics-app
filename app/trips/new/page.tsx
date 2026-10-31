import { Page, PageHeader } from "../../ui";
import { TripForm } from "./trip-form";

export default async function NewTripPage({
  searchParams,
}: {
  searchParams: Promise<{ copy?: string; quote?: string }>;
}) {
  // `?copy=<id>` užpildo formą pagal esamą reisą, bet numerio ir datos
  // neperkelia – jie kiekvienam reisui savi (#129). `?quote=<id>` – pasiūlymas
  // iš žurnalo paverčiamas reisu (Phase 0, 5).
  const { copy, quote } = await searchParams;

  return <Page>
    <PageHeader
      title={copy ? "Naujas reisas pagal ankstesnį" : quote ? "Naujas reisas iš pasiūlymo" : "Naujas reisas"}
      description={copy
        ? "Laukai užpildyti iš pasirinkto reiso. Įrašykite naują numerį ir patikrinkite datą."
        : quote ? "Laukai užpildyti iš pasiūlymo žurnalo. Įrašykite reiso numerį ir išsaugokite." : undefined}
    />
    {/* Be PTV rakto mygtukas nerodomas – forma veikia kaip iki #61. */}
    <div className="mt-5 rounded-lg border border-line bg-surface p-5 sm:p-6"><TripForm copyFromId={copy} quoteId={copy ? undefined : quote} routeLookup={Boolean(process.env.PTV_API_KEY)} /></div>
  </Page>;
}
