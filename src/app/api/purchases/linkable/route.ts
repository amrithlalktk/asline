import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { findLinkablePurchases } from "@/lib/purchaseLinks";

// Purchases the sale form can offer under "Against purchase bills" —
// ?itemIds=a,b&date=YYYY-MM-DD[&saleId=…] (saleId keeps that sale's own
// links in the list while editing it).
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const itemIds = (searchParams.get("itemIds") ?? "").split(",").filter(Boolean);
  const date = new Date(searchParams.get("date") || Date.now());
  if (Number.isNaN(date.getTime())) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }
  return NextResponse.json(
    await findLinkablePurchases({ itemIds, date, saleId: searchParams.get("saleId") })
  );
}
