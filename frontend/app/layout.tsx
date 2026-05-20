import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nova Research Assistant",
  description: "Multi-agent business research powered by LangGraph",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="app-bg min-h-screen bg-ink-950 text-ink-50 font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
