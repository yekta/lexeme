import { Navbar } from "@/components/navbar";
import SignInForm from "@/components/sign-in-form";

export default function SignInPage() {
  return (
    <div className="w-full flex flex-col">
      <Navbar />
      <SignInForm className="pt-10 pb-[calc(2rem+6vh)]" />
    </div>
  );
}
