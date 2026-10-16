import { redirect } from "next/navigation";

export default function EstudioIndex({ searchParams }: { searchParams: { client?: string } }) {
  redirect(`/estudio/plan${searchParams.client ? `?client=${encodeURIComponent(searchParams.client)}` : ""}`);
}
