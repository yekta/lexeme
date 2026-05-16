import { auth } from "@/server/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SIGN_IN_PATHNAME } from "@/lib/constants";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect(SIGN_IN_PATHNAME);
  return <>{children}</>;
}
