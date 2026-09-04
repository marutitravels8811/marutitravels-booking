import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { excelWorkbook, moneyPaise } from "@/lib/excel";
import {
  getBookingReportRows, getFinanceReportRows, validReportRange,
} from "@/server/reports";

export async function GET(request: NextRequest) {
  await requireSession();
  const params = request.nextUrl.searchParams;
  const range = validReportRange(params.get("from") ?? undefined, params.get("to") ?? undefined);
  const kind = params.get("kind") === "finance" ? "finance" : "bookings";
  const query = params.get("q") ?? "";
  const basis = params.get("basis") === "travel" ? "travel" : "booked";

  if (kind === "finance") {
    const rows = await getFinanceReportRows(range);
    const html = excelWorkbook(`Finance report ${range.from} to ${range.to}`,
      ["PNR", "Customer", "Phone", "Travel date", "Route", "Bus", "Status", "Total", "Paid", "Payment type"],
      rows.map((r) => [r.pnr, r.customer, r.phone, r.travelDate, r.route, r.bus, r.status,
        moneyPaise(Number(r.totalPaise)), moneyPaise(Number(r.paidPaise)), r.paymentType]));
    return new NextResponse(html, { headers: {
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": `attachment; filename="finance-${range.from}-to-${range.to}.xls"`,
    }});
  }

  const rows = await getBookingReportRows(range, query, basis);
  const html = excelWorkbook(`Bookings report ${range.from} to ${range.to}`,
    ["PNR", "Customer name", "Number", "Seat", "Bus", "Payment", "Status", "Pickup"],
    rows.map((r) => [r.pnr, r.customer, r.phone, r.seats, r.bus,
      r.paymentType, r.status, r.pickup ?? "—"]));
  return new NextResponse(html, { headers: {
    "Content-Type": "application/vnd.ms-excel; charset=utf-8",
    "Content-Disposition": `attachment; filename="bookings-${range.from}-to-${range.to}.xls"`,
  }});
}
