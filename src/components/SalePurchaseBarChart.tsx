"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCents } from "@/lib/money";
import { BRAND } from "@/lib/brand";

// Matches the Add Sale (brand violet) / Add Purchase (blue) button colors,
// so the chart's series identity is consistent with the rest of the app.
const SALE_COLOR = BRAND.color;
const PURCHASE_COLOR = "#2a78d6";

export type SalePurchasePoint = {
  label: string;
  saleCents: number;
  purchaseCents: number;
};

export default function SalePurchaseBarChart({ data }: { data: SalePurchasePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.1} />
        <XAxis
          dataKey="label"
          tick={{ fill: "currentColor", fontSize: 12 }}
          axisLine={{ stroke: "currentColor", opacity: 0.2 }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "currentColor", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(value: number) => formatCents(value)}
          width={80}
        />
        <Tooltip
          formatter={(value) => formatCents(Number(value))}
          contentStyle={{
            background: "var(--background)",
            color: "var(--foreground)",
            border: "1px solid rgba(128,128,128,0.3)",
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar
          dataKey="saleCents"
          name="Sale"
          fill={SALE_COLOR}
          radius={[3, 3, 0, 0]}
          maxBarSize={18}
          isAnimationActive={false}
        />
        <Bar
          dataKey="purchaseCents"
          name="Purchase"
          fill={PURCHASE_COLOR}
          radius={[3, 3, 0, 0]}
          maxBarSize={18}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
