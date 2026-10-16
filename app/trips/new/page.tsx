import { Page, PageHeader } from "../../ui";
import { TripForm } from "./trip-form";

export default async function NewTripPage({
  searchParams,
}: {
  searchParams: Promise<{ copy?: string }>;
}) {
  // `?copy=<id>` užpildo formą pagal esamą reisą, bet numerio ir datos
  // neperkelia – jie kiekvienam reisui savi (#129).
  const { copy } = await searchParams;

  return <Page width="narrow">
    <PageHeader
      title={copy ? "Naujas reisas pagal ankstesnį" : "Naujas reisas"}
      description={copy ? "Laukai užpildyti iš pasirinkto reiso. Įrašykite naują numerį ir patikrinkite datą." : undefined}
    />
    {/* Be PTV rakto mygtukas nerodomas – forma veikia kaip iki #61. */}
    <div className="mt-5 rounded-lg border border-line bg-surface p-5 sm:p-6"><TripForm copyFromId={copy} routeLookup={Boolean(process.env.PTV_API_KEY)} /></div>
  </Page>;
}
