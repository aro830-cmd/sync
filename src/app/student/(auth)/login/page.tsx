import type { Metadata } from "next";
import { AuthForm } from "@/components/student/AuthForm";

export const metadata: Metadata = { title: "Student login — Relay" };

export default function Page() {
  return <AuthForm mode="login" />;
}
