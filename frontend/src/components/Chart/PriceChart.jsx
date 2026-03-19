import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import dayjs from 'dayjs';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

function formatPrice(value) {
  if (value >= 10000) {
    const eok = Math.floor(value / 10000);
    const remainder = value % 10000;
    return remainder > 0 ? `${eok}억 ${remainder.toLocaleString()}` : `${eok}억`;
  }
  return `${value.toLocaleString()}만`;
}

export default function PriceChart({ trades = [], title = '거래가 추이' }) {
  if (!trades.length) {
    return (
      <div className={title ? 'bg-white rounded-xl border border-gray-200 p-6' : ''}>
        {title && <h3 className="text-lg font-bold text-gray-800 mb-4">{title}</h3>}
        <p className="text-gray-400 text-center py-8">거래 데이터가 없습니다</p>
      </div>
    );
  }

  const sortedTrades = [...trades].sort(
    (a, b) => new Date(a.tradeDate) - new Date(b.tradeDate)
  );

  const labels = sortedTrades.map((t) => dayjs(t.tradeDate).format('YY.MM'));
  const prices = sortedTrades.map((t) => t.price);

  const data = {
    labels,
    datasets: [
      {
        label: '거래가 (만원)',
        data: prices,
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37, 99, 235, 0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 3,
        pointHoverRadius: 6,
        pointBackgroundColor: '#2563eb',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
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
          label: (ctx) => `${formatPrice(ctx.raw)}만원`,
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
    interaction: {
      intersect: false,
      mode: 'index',
    },
  };

  return (
    <div className={title ? 'bg-white rounded-xl border border-gray-200 p-6' : ''}>
      {title && <h3 className="text-lg font-bold text-gray-800 mb-4">{title}</h3>}
      <div className="h-64">
        <Line data={data} options={options} />
      </div>
    </div>
  );
}
