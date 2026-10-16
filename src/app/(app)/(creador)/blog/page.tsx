import { redirect } from "next/navigation";
import { blogEntryDestination } from "@/lib/blog-navigation";

export default function BlogPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  redirect(blogEntryDestination(searchParams));
}
