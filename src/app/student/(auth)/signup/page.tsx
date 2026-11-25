import type { Metadata } from "next";
import { AuthForm } from "@/components/student/AuthForm";

export const metadata: Metadata = { title: "Student sign up — Relay" };

export default function Page() {
  return <AuthForm mode="signup" />;
}
