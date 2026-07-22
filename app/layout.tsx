import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "SweDox Control Center",
  description: "Internt system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="sv">
      <body>{children}</body>
    </html>
  );
}
