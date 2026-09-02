import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bus Booking — Counter",
  description: "Internal seat reservation and ticketing for the travel office",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // the seat map is dense; allow pinch-zoom rather than locking the scale
  maximumScale: 5,
  themeColor: "#2f5ceb",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
