import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { AppShell } from "./app-shell";
import "./globals.css";

/**
 * IBM Plex – šriftas, kurtas inžinerinėms sistemoms: aiškūs skaitmenys,
 * siauras, tankiai telpa į lenteles. `latin-ext` būtinas: be jo ą, č, ę, ė, į,
 * š, ų, ū, ž atvaizduojami atsarginiu šriftu, ir tekstas atrodo sulipdytas.
 */
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Bramit",
  description: "Reisų pelningumas",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="lt">
      <body className={`${plexSans.variable} ${plexMono.variable} antialiased`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
