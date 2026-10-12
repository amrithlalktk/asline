"use client";

import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCents } from "@/lib/money";
import { CATEGORY_COLORS } from "@/lib/colors";

export type CategoryTotal = { name: string; totalCents: number };

const MAX_SLOTS = 8;

export default function CategoryBreakdownChart({ data }: { data: CategoryTotal[] }) {
  const sorted = [...data].sort((a, b) => b.totalCents - a.totalCents);
  const top = sorted.slice(0, MAX_SLOTS - 1);
  const rest = sorted.slice(MAX_SLOTS - 1);
  const chartData =
    rest.length > 0
      ? [...top, { name: "Other", totalCents: rest.reduce((a, c) => a + c.totalCents, 0) }]
      : top;

  const height = Math.max(160, chartData.length * 40);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 4, right: 40, left: 8, bottom: 4 }}
      >
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="name"
          width={140}
          tick={{ fill: "currentColor", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          formatter={(value) => formatCents(Number(value))}
          contentStyle={{ background: "var(--background)", color: "var(--foreground)", border: "1px solid rgba(128,128,128,0.3)" }}
        />
        <Bar dataKey="totalCents" radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {chartData.map((entry, index) => (
            <Cell key={entry.name} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
          ))}
          <LabelList
            dataKey="totalCents"
            position="right"
            formatter={(value?: React.ReactNode) => formatCents(Number(value))}
            fill="currentColor"
            fontSize={12}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
