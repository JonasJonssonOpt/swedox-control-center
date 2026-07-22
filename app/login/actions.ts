"use server";

import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const GENERIC_LOGIN_ERROR =
  "Inloggningen misslyckades. Kontrollera dina uppgifter och försök igen.";

export type LoginState = Readonly<{
  error: string | null;
}>;

export async function login(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const emailValue = formData.get("email");
  const passwordValue = formData.get("password");

  if (typeof emailValue !== "string" || typeof passwordValue !== "string") {
    return { error: GENERIC_LOGIN_ERROR };
  }

  const email = emailValue.trim();

  if (!email || !passwordValue) {
    return { error: GENERIC_LOGIN_ERROR };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: passwordValue,
    });

    if (error) {
      console.error(
        `[auth.login.failed] code=${error.code ?? "unknown"} status=${error.status ?? "unknown"}`,
      );
      return { error: GENERIC_LOGIN_ERROR };
    }
  } catch {
    return { error: GENERIC_LOGIN_ERROR };
  }

  redirect("/auth/pending");
}
