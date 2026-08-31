import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CANdash — J1939 dashboard",
  description:
    "A local-first J1939 dashboard for live SocketCAN, candump replay, ECU discovery, profiles, and gauges.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
