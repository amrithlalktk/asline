import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getReportPdfBuffer } from "@/lib/reportExport";
import { getCompany } from "@/lib/companyServer";
import { resolveRecipients, sendMail } from "@/lib/mail";

const schema = z.object({
  filename: z.string().min(1),
  title: z.string().min(1),
  header: z.array(z.string()),
  rows: z.array(z.array(z.string())),
  to: z.unknown().optional(),
});

// Generic — every report page already builds the same {title, header, rows}
// shape for its "Export PDF" button (see src/lib/reportExport.ts), so one
// endpoint covers all of them instead of one route per report.
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { notifyEmails: true },
  });
  const to = resolveRecipients(parsed.data.to, user?.notifyEmails ?? null);
  if (!to) {
    return NextResponse.json(
      { error: "Pick at least one recipient, or set your notification email in Account settings." },
      { status: 400 }
    );
  }

  const { filename, title, header, rows } = parsed.data;
  const pdf = getReportPdfBuffer({ title, header, rows, generatedBy: session.name, company: await getCompany() });

  await sendMail({
    to,
    subject: title,
    text: `Attached: ${title}.`,
    attachments: [{ filename, content: pdf, contentType: "application/pdf" }],
  });

  return NextResponse.json({ ok: true, sentTo: to });
}
