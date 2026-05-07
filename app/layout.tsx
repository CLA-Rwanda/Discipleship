import type { Metadata, Viewport } from "next";
import { DM_Sans, Barlow_Condensed } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-heading",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CLA Discipleship",
  description: "Christian Life Assembly — Discipleship & Attendance Management",
  manifest: "/manifest.json",
  icons: {
    icon: "/cla-logo-icon.png",
    shortcut: "/cla-logo-icon.png",
    apple: "/cla-logo-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CLA Discipleship",
  },
};

export const viewport: Viewport = {
  themeColor: "#200909",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/cla-logo-icon.png" />
      </head>
      <body className={`${dmSans.className} ${barlowCondensed.variable}`}>{children}</body>
    </html>
  );
}
