import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Title, Tooltip, Legend, Filler
);

function formatPrice(value) {
  if (value >= 10000) {
    const eok = Math.floor(value / 10000);
    const rem = value % 10000;
    return rem > 0 ? `${eok}억 ${rem.toLocaleString()}` : `${eok}억`;
  }
  return `${value.toLocaleString()}만`;
}

export default function MonthlyStatsChart({ stats = [], title = '월별 시세 통계' }) {
  if (!stats.length) {
    return (
      <div className={title ? 'bg-white rounded-xl border border-gray-200 p-6' : ''}>
        {title && <h3 className="text-lg font-bold text-gray-800 mb-4">{title}</h3>}
        <p className="text-gray-400 text-center py-8">통계 데이터가 없습니다</p>
      </div>
    );
  }

  const labels = stats.map((s) => s.month);

  const data = {
    labels,
    datasets: [
      {
        type: 'line',
        label: '평균가',
        data: stats.map((s) => s.avg_price),
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37, 99, 235, 0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 2,
        pointHoverRadius: 5,
        yAxisID: 'y',
        order: 1,
      },
      {
        type: 'line',
        label: '최고가',
        data: stats.map((s) => s.max_price),
        borderColor: '#ef4444',
        borderDash: [4, 4],
        pointRadius: 0,
        tension: 0.3,
        yAxisID: 'y',
        order: 2,
      },
      {
        type: 'line',
        label: '최저가',
        data: stats.map((s) => s.min_price),
        borderColor: '#22c55e',
        borderDash: [4, 4],
        pointRadius: 0,
        tension: 0.3,
        yAxisID: 'y',
        order: 3,
      },
      {
        type: 'bar',
        label: '거래량',
        data: stats.map((s) => s.trade_count),
        backgroundColor: 'rgba(148, 163, 184, 0.4)',
        borderRadius: 3,
        yAxisID: 'y1',
        order: 4,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'top',
        labels: { usePointStyle: true, pointStyle: 'line', font: { size: 11 }, padding: 16 },
      },
      tooltip: {
        backgroundColor: '#1e293b',
        padding: 12,
        callbacks: {
          label: (ctx) => {
            if (ctx.dataset.yAxisID === 'y1') return `거래량: ${ctx.raw}건`;
            return `${ctx.dataset.label}: ${formatPrice(ctx.raw)}만원`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 10 }, color: '#9ca3af', maxRotation: 45 },
      },
      y: {
        position: 'left',
        grid: { color: '#f3f4f6' },
        ticks: {
          font: { size: 11 }, color: '#9ca3af',
          callback: (v) => formatPrice(v),
        },
      },
      y1: {
        position: 'right',
        grid: { display: false },
        ticks: { font: { size: 11 }, color: '#94a3b8' },
        title: { display: true, text: '거래량', font: { size: 11 }, color: '#94a3b8' },
      },
    },
  };

  return (
    <div className={title ? 'bg-white rounded-xl border border-gray-200 p-6' : ''}>
      {title && <h3 className="text-lg font-bold text-gray-800 mb-4">{title}</h3>}
      <div className="h-72">
        <Chart type="bar" data={data} options={options} />
      </div>
    </div>
  );
}
