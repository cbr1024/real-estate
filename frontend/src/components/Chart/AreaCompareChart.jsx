import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

function formatPrice(value) {
  if (value >= 10000) {
    const eok = Math.floor(value / 10000);
    const remainder = value % 10000;
    return remainder > 0 ? `${eok}억 ${remainder.toLocaleString()}` : `${eok}억`;
  }
  return `${value.toLocaleString()}만`;
}

function sqmToPyeong(sqm) {
  return Math.round(sqm / 3.306);
}

export default function AreaCompareChart({ areaData = [], title = '평형별 비교' }) {
  if (!areaData.length) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">{title}</h3>
        <p className="text-gray-400 text-center py-8">면적별 데이터가 없습니다</p>
      </div>
    );
  }

  const sorted = [...areaData].sort((a, b) => a.area - b.area);

  const labels = sorted.map(
    (d) => `${sqmToPyeong(d.area)}평 (${d.area}㎡)`
  );
  const prices = sorted.map((d) => d.avgPrice);

  const data = {
    labels,
    datasets: [
      {
        label: '평균 거래가 (만원)',
        data: prices,
        backgroundColor: sorted.map(
          (_, i) => {
            const colors = [
              'rgba(37, 99, 235, 0.8)',
              'rgba(59, 130, 246, 0.8)',
              'rgba(96, 165, 250, 0.8)',
              'rgba(147, 197, 253, 0.8)',
              'rgba(191, 219, 254, 0.8)',
            ];
            return colors[i % colors.length];
          }
        ),
        borderColor: sorted.map(
          (_, i) => {
            const colors = [
              '#2563eb',
              '#3b82f6',
              '#60a5fa',
              '#93c5fd',
              '#bfdbfe',
            ];
            return colors[i % colors.length];
          }
        ),
        borderWidth: 1,
        borderRadius: 6,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: '#1e293b',
        titleFont: { size: 12 },
        bodyFont: { size: 13, weight: 'bold' },
        padding: 12,
        callbacks: {
          label: (ctx) => `평균: ${formatPrice(ctx.raw)}만원`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 11 }, color: '#9ca3af' },
      },
      y: {
        grid: { color: '#f3f4f6' },
        ticks: {
          font: { size: 11 },
          color: '#9ca3af',
          callback: (value) => formatPrice(value),
        },
      },
    },
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="text-lg font-bold text-gray-800 mb-4">{title}</h3>
      <div className="h-64">
        <Bar data={data} options={options} />
      </div>
    </div>
  );
}
