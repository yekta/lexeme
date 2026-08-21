import { Navbar } from "@/components/navbar";
import SignInForm from "@/components/sign-in-form";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/sign-in/")({
  component: SignInPage,
});

function SignInPage() {
  return (
    <div className="w-full flex flex-col min-h-screen">
      <Navbar />
      <SignInForm className="pt-10 pb-[calc(2.5rem+8vh)]" />
    </div>
  );
}
