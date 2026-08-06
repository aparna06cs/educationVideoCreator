import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Loader2, Mail, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password — LessonReel" },
      { name: "description", content: "Set a new password for your LessonReel account." },
      { property: "og:title", content: "Reset password — LessonReel" },
      { property: "og:description", content: "Set a new password for your LessonReel account." },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"request" | "set">("request");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    if (hash.get("type") === "recovery") {
      setMode("set");
    }
  }, []);

  async function handleRequest(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (err) throw err;
      setMessage("If this email is registered, you will receive a reset link.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSet(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
      setMessage("Password updated. You can now sign in with your new password.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="paper-grain min-h-screen">
      <div className="mx-auto w-full max-w-md px-6 py-12">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          Back to LessonReel
        </Link>

        <h1 className="mt-8 font-display text-3xl">
          {mode === "request" ? "Reset your password" : "Set a new password"}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {mode === "request"
            ? "We'll send a password reset link to your email."
            : "Choose a new password for your account."}
        </p>

        <form
          onSubmit={mode === "request" ? handleRequest : handleSet}
          className="mt-6 space-y-4"
        >
          {mode === "request" ? (
            <div>
              <label htmlFor="email" className="block text-sm font-medium">
                Email
              </label>
              <div className="relative mt-1">
                <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-full border border-input bg-background py-2.5 pl-10 pr-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  placeholder="you@example.com"
                />
              </div>
            </div>
          ) : (
            <div>
              <label htmlFor="password" className="block text-sm font-medium">
                New password
              </label>
              <div className="relative mt-1">
                <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-full border border-input bg-background py-2.5 pl-10 pr-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  placeholder="••••••••"
                />
              </div>
            </div>
          )}

          {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          {message && <p className="rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">{message}</p>}

          <button
            type="submit"
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.02] disabled:opacity-70"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {mode === "request" ? "Send reset link" : "Update password"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link to="/auth" className="font-medium text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
