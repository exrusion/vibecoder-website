"use client";

import { signIn } from "next-auth/react";

// Auth.js stores one OAuth state cookie per provider. Starting a second X flow
// before the first callback overwrites that cookie and makes the first fail.
let pendingXSignIn = false;

export async function startXSignIn(redirectTo: string) {
  if (pendingXSignIn) return false;
  pendingXSignIn = true;
  try {
    await signIn("twitter", { redirectTo });
    return true;
  } catch (error) {
    pendingXSignIn = false;
    throw error;
  }
}
