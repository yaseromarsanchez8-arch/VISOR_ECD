import React from 'react';
import { Bar } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend,
} from 'chart.js';

ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend
);

function HistogramPanel({ data, onBarClick }) {
    if (!data) {
        return <div>Loading...</div>;
    }

    const counts = (data.values || []).map(entry => {
        if (typeof entry === 'number') return entry;
        if (typeof entry === 'object' && entry !== null) {
            if (typeof entry.y === 'number') return entry.y;
            if (typeof entry.count === 'number') return entry.count;
        }
        return 0;
    });

    const chartData = {
        labels: data.labels,
        datasets: [
            {
                label: 'Count',
                data: counts,
                backgroundColor: 'rgba(75, 192, 192, 0.6)',
            },
        ],
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (event, elements) => {
            if (onBarClick && elements.length > 0) {
                const elementIndex = elements[0].index;
                const dbEntry = data.values?.[elementIndex];
                const dbIds = Array.isArray(dbEntry?.dbIds) ? dbEntry.dbIds : [];
                onBarClick(dbIds);
            }
        },
    };

    return <Bar data={chartData} options={options} />;
}

export default HistogramPanel;
