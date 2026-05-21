import { createFileRoute } from "@tanstack/react-router";
import SignInForm from "@/components/sign-in-form";

export const Route = createFileRoute("/sign-in")({
  component: SignInForm,
});
