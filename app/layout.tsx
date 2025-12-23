import "./globals.css";
import { Fraunces, Space_Grotesk } from "next/font/google";
import PageReveal from "./components/PageReveal";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans"
});

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-serif"
});

export const metadata = {
  title: "Dream-X Orchestrator",
  description: "Unified Gmail orchestration for board@dream-x.app and general@playerxchange.org"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${spaceGrotesk.variable} ${fraunces.variable}`}>
        <PageReveal>{children}</PageReveal>
      </body>
    </html>
  );
}
