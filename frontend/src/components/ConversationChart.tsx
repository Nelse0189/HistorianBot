import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from 'recharts';

type EmotionData = {
  name: string;
  value: number;
};

type ConversationChartProps = {
  data: EmotionData[];
};

export function ConversationChart({ data }: ConversationChartProps) {
  if (!data || data.length === 0) {
    return <div className="text-center text-gray-500">No emotion data available to display chart.</div>;
  }
  
  // Custom colors for each emotion
  const colors = {
    'Happy': '#4ade80', // green-400
    'Calm': '#60a5fa',  // blue-400
    'Anger': '#f87171', // red-400
    'Neutral': '#9ca3af'// gray-400
  };

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart
        data={data}
        margin={{
          top: 20,
          right: 30,
          left: 0,
          bottom: 5,
        }}
        layout="vertical"
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis type="number" domain={[0, 100]} stroke="#9ca3af" tickFormatter={(tick) => `${tick}%`} />
        <YAxis type="category" dataKey="name" stroke="#9ca3af" width={80} />
        <Tooltip
          cursor={{ fill: 'rgba(107, 114, 128, 0.2)' }}
          contentStyle={{
            background: 'rgba(31, 41, 55, 0.8)',
            borderColor: '#4b5563',
            borderRadius: '0.5rem',
            color: '#e5e7eb'
          }}
          formatter={(value: number) => [`${value}%`, 'Percentage']}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            <LabelList dataKey="value" position="right" formatter={(value: React.ReactNode) => `${value}%`} style={{ fill: '#e5e7eb' }} />
            {data.map((entry) => (
              <Bar key={`cell-${entry.name}`} fill={colors[entry.name as keyof typeof colors] || '#8884d8'} />
            ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
} 