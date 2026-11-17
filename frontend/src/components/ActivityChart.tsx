import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

interface ActivityPoint {
  date: string;
  findings: number;
  critical: number;
}

export default function ActivityChart({ data }: { data: ActivityPoint[] }) {
  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 12, right: 12, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="findingFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8293ff" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#8293ff" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted)", fontSize: 11 }}
            tickFormatter={(value: string) => value.slice(5)}
            dy={8}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted)", fontSize: 11 }}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              background: "var(--surface-raised)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              color: "var(--text)",
            }}
            labelStyle={{ color: "var(--muted)" }}
          />
          <Area
            type="monotone"
            dataKey="findings"
            name="Findings"
            stroke="#8293ff"
            strokeWidth={2.3}
            fill="url(#findingFill)"
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
