import { Suspense } from "react";
import { BlogNavigation } from "@/components/blog-navigation";

export default function CreadorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <Suspense>
        <BlogNavigation />
      </Suspense>
      {children}
    </div>
  );
}
