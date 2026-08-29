import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bifrost — Intelligent LLM Router",
  description:
    "Route prompts to the cheapest model that still answers well.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
