import type { Metadata } from "next";
import { DocumentsView } from "@/components/documents/documents-view";

export const metadata: Metadata = { title: "Documentos" };

export default function Page() {
  return <DocumentsView />;
}
