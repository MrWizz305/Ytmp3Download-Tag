import type { Metadata } from "next";
import { Source_Serif_4, Press_Start_2P } from "next/font/google";
import "./globals.css";
import AlbumBounce from "@/components/AlbumBounce";

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const pixelFont = Press_Start_2P({
  variable: "--font-pixel",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "YouTube → MP3",
  description: "Personal YouTube audio to MP3 converter.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${sourceSerif.variable} ${pixelFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <AlbumBounce />
      </body>
    </html>
  );
}
