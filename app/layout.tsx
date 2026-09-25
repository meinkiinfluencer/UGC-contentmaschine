import "./globals.css";
import Link from "next/link";

export const metadata = { title: "UGC Contentmaschine" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <nav>
          <b>⚡ UGC Contentmaschine</b>
          <Link href="/">Pipeline</Link>
          <Link href="/runs">Runs / Ideen</Link>
          <Link href="/settings">Marke & Avatar</Link>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
