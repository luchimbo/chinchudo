import { notFound } from "next/navigation";
import LoadingPreview from "./preview";

export const dynamic = "force-dynamic";

async function waitForPreview() {
  "use server";
  await new Promise((resolve) => setTimeout(resolve, 2200));
}

export default function LoadingPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <LoadingPreview action={waitForPreview} />;
}
