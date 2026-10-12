"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Clock3, XCircle } from "lucide-react";

const OVERDUE_DAYS = 30;

// Unpaid isn't "delayed" the day it's recorded — the red mark only kicks in
// once it's been sitting unpaid past OVERDUE_DAYS; before that it's just a
// neutral dot so a same-week credit sale doesn't read as a problem.
export default function PaymentStatusIcon({
  date,
  totalCents,
  paidCents,
}: {
  date: string;
  totalCents: number;
  paidCents: number;
}) {
  // Date.now() is impure — it can't be called during render (the same props
  // must always render the same output). Compute "now" after mount instead,
  // so the initial render is deterministic and only flips to overdue once
  // the real elapsed time is known.
  const [daysSince, setDaysSince] = useState(0);
  useEffect(() => {
    setDaysSince(Math.floor((Date.now() - new Date(date).getTime()) / 86400000));
  }, [date]);

  if (paidCents >= totalCents) {
    return (
      <CheckCircle2 size={15} className="shrink-0 text-[#0ca30c]" aria-label="Paid in full" />
    );
  }
  if (paidCents > 0) {
    return <Clock3 size={15} className="shrink-0 text-[#fab219]" aria-label="Partially paid" />;
  }
  if (daysSince > OVERDUE_DAYS) {
    return <XCircle size={15} className="shrink-0 text-[#d03b3b]" aria-label="Unpaid — overdue" />;
  }
  return (
    <Circle
      size={15}
      className="shrink-0 text-black/25 dark:text-white/25"
      aria-label="Unpaid"
    />
  );
}
