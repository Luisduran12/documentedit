import type { Metadata } from "next";
import { EditorPicker } from "@/components/editor/editor-picker";

export const metadata: Metadata = { title: "Editor" };

export default function Page() {
  return <EditorPicker />;
}
