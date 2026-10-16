import { Suspense } from "react";
import { StepBar } from "@/components/studio/step-bar";

export default function EstudioLayout({ children }: { children: React.ReactNode }) {
  return <div className="video-studio flex min-h-screen flex-col bg-paper text-ink">
    <Suspense>
      <StepBar />
    </Suspense>
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-5 sm:py-8">{children}</main>
  </div>;
}
