import Logo from "@/components/icons/logo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";

type TProps = {
  className?: string;
};

export default function SignInForm({ className }: TProps) {
  const [isSigningIn, setIsSigningIn] = useState(false);
  const { signInWithGoogle, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) router.navigate({ to: "/" });
  }, [user, router]);

  const handleSignIn = async () => {
    setIsSigningIn(true);
    try {
      await signInWithGoogle();
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <div
      className={cn(
        "flex flex-1 flex-col items-center justify-center p-4",
        className,
      )}
    >
      <div className="max-w-md text-center gap-6 flex flex-col w-full items-center">
        <div className="w-full flex flex-col gap-1">
          <Logo className="mx-auto size-14" />
          <h1 className="text-4xl font-bold tracking-tight text-foreground mt-2">
            Lexeme
          </h1>
          <p className="text-lg text-muted-foreground">
            Master any subject with spaced repetition.
          </p>
        </div>
        <Button
          onClick={handleSignIn}
          className="w-full max-w-64"
          isPending={isSigningIn}
        >
          Sign in with Google
        </Button>
      </div>
    </div>
  );
}
