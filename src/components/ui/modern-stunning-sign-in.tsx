"use client"

import * as React from "react"
import { Mail, Lock, Chrome } from "lucide-react"

const SignIn1 = () => {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");

  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleSignIn = () => {
    if (!email || !password) {
      setError("Please enter both email and password.");
      return;
    }
    if (!validateEmail(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    setError("");
    alert("Sign in successful! (Demo)");
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-background">
      {/* Background gradient blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
      </div>

      {/* Centered glass card */}
      <div className="relative z-10 mx-4 w-full max-w-md rounded-2xl border border-border/40 bg-card/80 p-8 shadow-xl backdrop-blur-xl">
        {/* Logo */}
        <div className="mb-6 flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg">
            <Lock className="h-6 w-6" />
          </div>
        </div>

        {/* Title */}
        <h1 className="mb-8 text-center text-2xl font-bold tracking-tight text-foreground">
          Sign in to your account
        </h1>

        {/* Form */}
        <div className="space-y-6">
          <div className="space-y-4">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex h-11 w-full rounded-xl border border-border/60 bg-background/60 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="flex h-11 w-full rounded-xl border border-border/60 bg-background/60 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>

          <div className="space-y-3">
            <button
              onClick={handleSignIn}
              className="flex h-11 w-full items-center justify-center rounded-xl bg-primary text-sm font-medium text-primary-foreground shadow-md transition-all hover:bg-primary/90 hover:shadow-lg active:scale-[0.98]"
            >
              Sign in
            </button>

            {/* Google Sign In */}
            <button className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border/60 bg-background/60 text-sm font-medium text-foreground transition-all hover:bg-accent hover:text-accent-foreground active:scale-[0.98]">
              <Chrome className="h-4 w-4" />
              Continue with Google
            </button>

            <p className="pt-2 text-center text-sm text-muted-foreground">
              Don't have an account?{" "}
              <a href="#" className="font-medium text-primary hover:underline">
                Sign up, it's free!
              </a>
            </p>
          </div>
        </div>
      </div>

      {/* User count and avatars */}
      <div className="absolute bottom-8 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-3">
        <p className="text-center text-sm text-muted-foreground">
          Join thousands of{" "}
          <span className="font-medium text-foreground">developers</span> who are already using this platform.
        </p>
        <div className="flex -space-x-2">
          <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=40&h=40&fit=crop&crop=face" alt="User" className="h-8 w-8 rounded-full border-2 border-background object-cover" />
          <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=40&h=40&fit=crop&crop=face" alt="User" className="h-8 w-8 rounded-full border-2 border-background object-cover" />
          <img src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=40&h=40&fit=crop&crop=face" alt="User" className="h-8 w-8 rounded-full border-2 border-background object-cover" />
          <img src="https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=40&h=40&fit=crop&crop=face" alt="User" className="h-8 w-8 rounded-full border-2 border-background object-cover" />
        </div>
      </div>
    </div>
  );
};

export { SignIn1 };
