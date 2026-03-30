import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FormFlood",
  description: "Bulk submit Google Forms at scale",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
