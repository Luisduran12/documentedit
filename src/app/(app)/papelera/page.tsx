import type { Metadata } from "next";
import { DocumentsView } from "@/components/documents/documents-view";

export const metadata: Metadata = { title: "Papelera" };

export default function Page() {
  return <DocumentsView trash />;
}
