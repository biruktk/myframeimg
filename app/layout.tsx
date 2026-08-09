import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://myframe.ink"),
  title: "MyFrame — Paper-like photo frame",
  description:
    "Smart photo frame: AI art, family sharing, live sync. Design aligned with ra/ui references.",
  icons: {
    icon: [{ url: "/icon.png", type: "image/png" }, { url: "/favicon.png", type: "image/png" }],
    shortcut: "/favicon.png",
    apple: "/apple-icon.png",
  },
  openGraph: {
    title: "MyFrame — Paper-like photo frame",
    description:
      "Smart photo frame: AI art, family sharing, live sync.",
    url: "https://myframe.ink/",
    siteName: "MyFrame",
    type: "website",
    images: [
      {
        url: "/assets/share-cover.jpg",
        width: 800,
        height: 533,
        alt: "MyFrame",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "MyFrame — Paper-like photo frame",
    description: "Smart photo frame: AI art, family sharing, live sync.",
    images: ["/assets/share-cover.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
