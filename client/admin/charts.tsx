import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { StatsZone } from "./data";

const PINE = "#16302b";
const LIME = "#c6d879";
const CLAY = "#a8452f";
const AMBER = "#c07a34";
const SAND = "#dedccc";
const STEEL = "#6c7a73";

const axe = {
  stroke: STEEL,
  fontSize: 10,
  fontFamily: "JetBrains Mono, monospace",
  letterSpacing: "0.08em",
};

function InfoBulle({ active, payload, label, suffix }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="border border-sand bg-[#fcfcf6] px-3 py-2 shadow-[0_18px_40px_-24px_rgba(13,31,27,0.6)]">
      <p className="font-mono-label text-[9px] text-steel">{label}</p>
      <div className="mt-1 space-y-0.5">
        {payload.map((entry: any) => (
          <p key={entry.dataKey} className="flex items-center gap-2 text-[11px] text-pine">
            <span className="h-1.5 w-1.5" style={{ background: entry.color }} />
            <span className="text-steel">{entry.name}</span>
            <span className="ml-auto font-semibold tabular-nums">
              {entry.value}
              {suffix ?? ""}
            </span>
          </p>
        ))}
      </div>
    </div>
  );
}

export function ZoneChart({ data }: { data: StatsZone[] }) {
  return (
    <ResponsiveContainer width="100%" height={218}>
      <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -18 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke={SAND} strokeDasharray="2 4" />
        <XAxis dataKey="zone" axisLine={false} tickLine={false} tick={{ ...axe, fontSize: 11 }} dy={6} />
        <YAxis axisLine={false} tickLine={false} tick={axe} allowDecimals={false} />
        <Tooltip content={<InfoBulle />} cursor={{ fill: "rgba(22,48,43,0.04)" }} />
        <Bar dataKey="conformes" name="Conformes" stackId="a" fill={PINE} radius={[0, 0, 0, 0]} maxBarSize={54} />
        <Bar dataKey="nonConformes" name="Non conformes" stackId="a" fill={CLAY} radius={[2, 2, 0, 0]} maxBarSize={54} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CritereChart({ data }: { data: { court: string; anomalies: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={252}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 0, right: 18, bottom: 0, left: 4 }}
        barCategoryGap="26%"
      >
        <CartesianGrid horizontal={false} stroke={SAND} strokeDasharray="2 4" />
        <XAxis type="number" axisLine={false} tickLine={false} tick={axe} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="court"
          axisLine={false}
          tickLine={false}
          width={78}
          tick={{ ...axe, fontSize: 10 }}
        />
        <Tooltip content={<InfoBulle />} cursor={{ fill: "rgba(22,48,43,0.04)" }} />
        <Bar dataKey="anomalies" name="Anomalies" fill={AMBER} radius={[0, 2, 2, 0]} maxBarSize={14} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function StatutDonut({ conformes, nonConformes }: { conformes: number; nonConformes: number }) {
  const total = conformes + nonConformes;
  const data = [
    { name: "Conformes", value: conformes, color: PINE },
    { name: "Non conformes", value: nonConformes, color: CLAY },
  ];
  const taux = total ? Math.round((conformes / total) * 1000) / 10 : 0;

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={218}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={62}
            outerRadius={86}
            paddingAngle={2}
            stroke="none"
            startAngle={90}
            endAngle={-270}
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<InfoBulle />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-3xl leading-none text-pine">{taux}%</span>
        <span className="mt-1 font-mono-label text-[8px] text-steel">conformité</span>
      </div>
    </div>
  );
}

export function TrendChart({ data }: { data: { label: string; conformes: number; nonConformes: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={190}>
      <AreaChart data={data} margin={{ top: 8, right: 6, bottom: 0, left: -20 }}>
        <defs>
          <linearGradient id="gradConforme" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={PINE} stopOpacity={0.26} />
            <stop offset="100%" stopColor={PINE} stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="gradNC" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CLAY} stopOpacity={0.22} />
            <stop offset="100%" stopColor={CLAY} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={SAND} strokeDasharray="2 4" />
        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={axe} interval="preserveStartEnd" />
        <YAxis axisLine={false} tickLine={false} tick={axe} allowDecimals={false} />
        <Tooltip content={<InfoBulle />} cursor={{ stroke: LIME, strokeWidth: 1 }} />
        <Area
          type="monotone"
          dataKey="conformes"
          name="Conformes"
          stroke={PINE}
          strokeWidth={1.6}
          fill="url(#gradConforme)"
        />
        <Area
          type="monotone"
          dataKey="nonConformes"
          name="Non conformes"
          stroke={CLAY}
          strokeWidth={1.4}
          fill="url(#gradNC)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
