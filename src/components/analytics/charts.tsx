"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  BrandCount,
  ChannelCount,
  IntentCount,
  PersonaCount,
  ResultCount,
  StatusCount,
  WeekPoint,
} from "@/lib/analytics";

// ─── Paleta ──────────────────────────────────────────────────────────────────

const MOSS    = "#536b45";
const BRASS   = "#b9872f";
const SIGNAL  = "#d84c2f";
const SLATE   = "#2f3a40";
const INK     = "#181713";
const INK20   = "rgba(24,23,19,0.2)";
const INK8    = "rgba(24,23,19,0.08)";

const STATUS_COLORS: Record<string, string> = {
  NEW:          SIGNAL,
  NEEDS_REVIEW: BRASS,
  DRAFTED:      "#c8a84b",
  APPROVED:     MOSS,
  PUBLISHED:    MOSS,
  FOLLOW_UP:    SLATE,
  CONVERTED:    "#2e6b3e",
  DISCARDED:    "#9ca3af",
};

const CHANNEL_COLORS = [SLATE, MOSS, BRASS, SIGNAL, "#6b5b3e", "#7b9b6c", "#8b6914"];

// ─── Tooltip común ───────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-ink/10 bg-paper px-3 py-2 shadow-panel text-xs">
      <p className="mb-1 font-semibold text-ink">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name ?? p.dataKey}: <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  );
}

// ─── Pipeline por estado ──────────────────────────────────────────────────────

export function PipelineChart({ data }: { data: StatusCount[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" margin={{ left: 4, right: 24, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke={INK8} />
        <XAxis type="number" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="label" width={82} tick={{ fontSize: 11, fill: INK }} axisLine={false} tickLine={false} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: INK8 }} />
        <Bar dataKey="count" name="Oportunidades" radius={[0, 4, 4, 0]} maxBarSize={22}>
          {data.map((entry) => (
            <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? SLATE} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Tendencia semanal ────────────────────────────────────────────────────────

export function WeeklyTrendChart({ data }: { data: WeekPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ left: 0, right: 16, top: 8, bottom: 4 }}>
        <CartesianGrid stroke={INK8} />
        <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
        <Tooltip content={<ChartTooltip />} />
        <Line
          type="monotone"
          dataKey="total"
          name="Nuevas"
          stroke={SLATE}
          strokeWidth={2}
          dot={{ r: 3, fill: SLATE }}
          activeDot={{ r: 5 }}
        />
        <Line
          type="monotone"
          dataKey="publicadas"
          name="Publicadas"
          stroke={MOSS}
          strokeWidth={2}
          dot={{ r: 3, fill: MOSS }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Por canal ────────────────────────────────────────────────────────────────

export function ChannelChart({ data }: { data: ChannelCount[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ left: 0, right: 16, top: 4, bottom: 28 }}>
        <CartesianGrid vertical={false} stroke={INK8} />
        <XAxis dataKey="channel" tick={{ fontSize: 11, fill: INK }} axisLine={false} tickLine={false} angle={-30} textAnchor="end" />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: INK8 }} />
        <Bar dataKey="count" name="Oportunidades" radius={[4, 4, 0, 0]} maxBarSize={40}>
          {data.map((entry, i) => (
            <Cell key={entry.channel} fill={CHANNEL_COLORS[i % CHANNEL_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Por marca ────────────────────────────────────────────────────────────────

export function BrandChart({ data }: { data: BrandCount[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ left: 0, right: 16, top: 4, bottom: 28 }}>
        <CartesianGrid vertical={false} stroke={INK8} />
        <XAxis dataKey="brand" tick={{ fontSize: 11, fill: INK }} axisLine={false} tickLine={false} angle={-20} textAnchor="end" />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: INK8 }} />
        <Bar dataKey="count" name="Oportunidades" radius={[4, 4, 0, 0]} maxBarSize={56} fill={BRASS} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Intenciones ──────────────────────────────────────────────────────────────

export function IntentChart({ data }: { data: IntentCount[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" margin={{ left: 4, right: 24, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke={INK8} />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="label" width={90} tick={{ fontSize: 11, fill: INK }} axisLine={false} tickLine={false} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: INK8 }} />
        <Bar dataKey="count" name="Ocurrencias" fill={SLATE} radius={[0, 4, 4, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Personas ─────────────────────────────────────────────────────────────────

export function PersonaChart({ data }: { data: PersonaCount[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" margin={{ left: 4, right: 24, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke={INK8} />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="persona" width={130} tick={{ fontSize: 11, fill: INK }} axisLine={false} tickLine={false} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: INK8 }} />
        <Bar dataKey="count" name="Respuestas" fill={MOSS} radius={[0, 4, 4, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Resultados de publicación ────────────────────────────────────────────────

export function ResultChart({ data }: { data: ResultCount[] }) {
  const RESULT_COLORS: Record<string, string> = {
    no_reply:       "#9ca3af",
    reply:          SLATE,
    positive_reply: MOSS,
    converted:      "#2e6b3e",
  };
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ left: 0, right: 16, top: 4, bottom: 28 }}>
        <CartesianGrid vertical={false} stroke={INK8} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: INK }} axisLine={false} tickLine={false} angle={-20} textAnchor="end" />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: INK8 }} />
        <Bar dataKey="count" name="Publicaciones" radius={[4, 4, 0, 0]} maxBarSize={48}>
          {data.map((entry) => (
            <Cell key={entry.result} fill={RESULT_COLORS[entry.result] ?? SLATE} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
