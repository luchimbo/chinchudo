import { redirect } from "next/navigation";

export default function PreviousBlogLink() {
  redirect("/blog?client=kressmer");
}
