"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency, formatNumber } from "@/lib/utils";

const PALETTE = [
  "#4f46e5",
  "#9333ea",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#6366f1",
  "#a855f7",
];

const AXIS = { fontSize: 11, fill: "#94a3b8" };

function shortDay(value: unknown) {
  return String(value ?? "").slice(5).replace("-", "/");
}

/** Recharts formatter imzaları gevşek tiplidir; tek noktada uyarlıyoruz. */
const asNumber = (value: unknown) => Number(value ?? 0);
const tokenFormatter = (value: unknown): [string, string] => [
  formatNumber(asNumber(value)),
  "Token",
];
const costFormatter = (value: unknown): [string, string] => [
  formatCurrency(asNumber(value)),
  "Maliyet",
];
const countFormatter = (value: unknown): [string, string] => [
  formatNumber(asNumber(value)),
  "Kayıt",
];

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid #e2e8f0",
  fontSize: 12,
  boxShadow: "0 8px 24px -12px rgb(15 23 42 / 0.25)",
};

export function TokenUsageChart({
  data,
}: {
  data: { day: string; tokens: number; costTry: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <defs>
          <linearGradient id="tokenGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="day"
          tickFormatter={shortDay}
          tick={AXIS}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={AXIS}
          axisLine={false}
          tickLine={false}
          tickFormatter={(value: unknown) =>
            asNumber(value) >= 1000
              ? `${Math.round(asNumber(value) / 1000)}k`
              : String(asNumber(value))
          }
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={tokenFormatter}
          labelFormatter={shortDay}
        />
        <Area
          type="monotone"
          dataKey="tokens"
          stroke="#4f46e5"
          strokeWidth={2}
          fill="url(#tokenGradient)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function CostChart({
  data,
}: {
  data: { day: string; costTry: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
        <XAxis
          dataKey="day"
          tickFormatter={shortDay}
          tick={AXIS}
          axisLine={false}
          tickLine={false}
        />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={costFormatter}
          labelFormatter={shortDay}
        />
        <Bar dataKey="costTry" fill="#9333ea" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SignupChart({ data }: { data: { day: string; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <XAxis
          dataKey="day"
          tickFormatter={shortDay}
          tick={AXIS}
          axisLine={false}
          tickLine={false}
        />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={countFormatter}
          labelFormatter={shortDay}
        />
        <Bar dataKey="count" fill="#10b981" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ModelPieChart({
  data,
}: {
  data: { name: string; tokens: number }[];
}) {
  const top = data.slice(0, 6);
  if (top.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-ink-400">
        Henüz veri yok
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={top}
          dataKey="tokens"
          nameKey="name"
          innerRadius={55}
          outerRadius={90}
          paddingAngle={2}
        >
          {top.map((entry, index) => (
            <Cell key={entry.name} fill={PALETTE[index % PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={tokenFormatter}
        />
        <Legend
          verticalAlign="bottom"
          iconType="circle"
          wrapperStyle={{ fontSize: 12 }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function OperationBarChart({
  data,
}: {
  data: { name: string; tokens: number }[];
}) {
  const top = data.slice(0, 8);
  if (top.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-ink-400">
        Henüz veri yok
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart
        data={top}
        layout="vertical"
        margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
      >
        <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ ...AXIS, fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          width={150}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={tokenFormatter}
        />
        <Bar dataKey="tokens" fill="#4f46e5" radius={[0, 6, 6, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
