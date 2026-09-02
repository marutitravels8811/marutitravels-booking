import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bus Booking — Counter",
  description: "Internal seat reservation and ticketing for the travel office",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
