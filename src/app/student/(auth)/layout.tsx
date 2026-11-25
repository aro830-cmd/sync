import { AuthLayout } from "@/components/student/AuthLayout";

// Shared by /student/login and /student/signup so the frame persists when switching between them.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <AuthLayout>{children}</AuthLayout>;
}
