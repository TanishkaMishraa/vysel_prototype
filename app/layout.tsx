import type { Metadata } from "next";
import { Cormorant_Garamond, Cinzel, DM_Sans } from "next/font/google";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
});

const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-cinzel",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-dm-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AuraFit Style Lab",
  description:
    "Skin-tone analysis, a generated Style DNA report, a live virtual makeup preview and a color-theory recommendation engine.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${cormorant.variable} ${cinzel.variable} ${dmSans.variable}`}>
        <SiteNav />
        <main className="wrap">
          {children}
          <SiteFooter />
        </main>
      </body>
    </html>
  );
}
