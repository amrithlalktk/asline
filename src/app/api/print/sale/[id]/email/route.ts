import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatBillNumber } from "@/lib/money";
import { buildInvoicePdfBuffer } from "@/lib/invoicePdf";
import { getCompany } from "@/lib/companyServer";
import { resolveRecipients, sendMail } from "@/lib/mail";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { notifyEmails: true },
  });
  const body = await request.json().catch(() => ({}));
  const to = resolveRecipients(body?.to, user?.notifyEmails ?? null);
  if (!to) {
    return NextResponse.json(
      { error: "Pick at least one recipient, or set your notification email in Account settings." },
      { status: 400 }
    );
  }

  const { id } = await params;
  const sale = await db.sale.findUnique({
    where: { id },
    include: {
      account: { select: { name: true } },
      party: true,
      items: { include: { item: { select: { name: true, unit: true } } } },
      charges: true,
    },
  });
  if (!sale) return NextResponse.json({ error: "Sale not found" }, { status: 404 });

  const pdf = buildInvoicePdfBuffer("SALE", sale, session.name, await getCompany());
  const filename = `sale_${formatBillNumber(sale.billNumber)}.pdf`;

  await sendMail({
    to,
    subject: `Sale Invoice #${formatBillNumber(sale.billNumber)}`,
    text: `Attached: Sale Invoice #${formatBillNumber(sale.billNumber)}.`,
    attachments: [{ filename, content: pdf, contentType: "application/pdf" }],
  });

  return NextResponse.json({ ok: true, sentTo: to });
}
