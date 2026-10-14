import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { Editor } from "@/components/editor/editor";

export const metadata: Metadata = { title: "Editor" };

async function EditorRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Editor key={id} documentId={id} />;
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary-fg" />
        </div>
      }
    >
      <EditorRoute params={params} />
    </Suspense>
  );
}
