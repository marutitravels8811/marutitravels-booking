import { redirect } from "next/navigation";
import { getSession } from "@/server/auth";

export default async function Root() {
  redirect((await getSession()) ? "/dashboard" : "/login");
}
