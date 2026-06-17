import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Fixels",
  description: "Repair one pixel. Leave your mark onchain.",
  icons: {
    icon: "/fixels.png",
    shortcut: "/fixels.png",
    apple: "/fixels.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}