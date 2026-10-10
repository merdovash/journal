import { Suspense } from "react";
import { LoadingState } from "@broker-journal/ui";
import { JournalApp } from "@/components/journal-app";

export default function HomePage() {
  return (
    <main className="min-h-dvh">
      <Suspense fallback={<LoadingState label="Загрузка…" />}>
        <JournalApp />
      </Suspense>
    </main>
  );
}
