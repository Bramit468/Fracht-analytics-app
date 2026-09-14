import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-8">
      <h1 className="text-4xl font-semibold tracking-tight">Fracht Analytics</h1>
      <p className="text-sm text-neutral-500">
        Reisu pelningumas. Zr. PROJECT.md.
      </p>
      <Link
        className="mt-4 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700"
        href="/trips/new"
      >
        New trip
      </Link>
    </main>
  );
}
