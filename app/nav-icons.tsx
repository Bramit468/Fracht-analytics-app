import {
  Building2,
  ChartColumn,
  FileSpreadsheet,
  Handshake,
  LayoutGrid,
  List,
  type LucideIcon,
  Navigation,
  Plus,
  Truck,
  Users,
} from "lucide-react";

/** Meniu piktogramos – viena linijinė šeima, vienodo storio (#205). */
export const NAV_ICONS: Record<string, LucideIcon> = {
  "/": LayoutGrid,
  "/trips": List,
  "/trips/new": Plus,
  "/trips/vyksta": Navigation,
  "/dedikuoti": Handshake,
  "/trucks": Truck,
  "/uzsakovai": Users,
  "/telematika": ChartColumn,
  "/trips/import": FileSpreadsheet,
  "/imone": Building2,
};
