import type { Metadata } from "next";
import { SharesView } from "@/components/shares/shares-view";

export const metadata: Metadata = { title: "Imágenes y QR" };

export default function Page() {
  return <SharesView />;
}
