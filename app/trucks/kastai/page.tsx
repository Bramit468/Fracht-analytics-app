import { redirect } from "next/navigation";

/**
 * Kaštai dabar – skirtukas furų puslapyje (#169). Senas adresas lieka veikti,
 * kad neišsibarstytų išsaugotos nuorodos.
 */
export default function TruckCostsPage() {
  redirect("/trucks?skiltis=kastai");
}
