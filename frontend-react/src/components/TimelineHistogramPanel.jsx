import React, { useRef, useEffect, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

function TimelineHistogramPanel({ isVisible, onBarClick }) {
    const [chartData, setChartData] = useState({
        labels: [],
        datasets: [{
            label: 'Active Tasks',
            data: [],
            backgroundColor: 'rgba(0, 128, 0, 0.5)',
            borderColor: 'rgba(0, 128, 0, 1)',
            borderWidth: 1
        }]
    });

    useEffect(() => {
        const handleUpdate = (e) => {
            setChartData({
                labels: e.detail.labels,
                datasets: [{
                    label: 'Active Tasks',
                    data: e.detail.data,
                    backgroundColor: 'rgba(0, 128, 0, 0.5)',
                    borderColor: 'rgba(0, 128, 0, 1)',
                    borderWidth: 1
                }]
            });
        };
        window.addEventListener('phasing-update-histogram', handleUpdate);
        return () => window.removeEventListener('phasing-update-histogram', handleUpdate);
    }, []);

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            title: { display: true, text: 'Weekly Active Tasks' }
        },
        scales: {
            x: {
                title: {
                    display: true,
                    text: 'Week'
                }
            },
            y: {
                beginAtZero: true,
                title: {
                    display: true,
                    text: '# Tasks'
                }
            }
        },
        onClick: (event, elements) => {
            if (elements.length > 0) {
                const index = elements[0].index;
                onBarClick(index);
            }
        }
    };

    if (!isVisible) {
        return null;
    }

    return (
        <div className="timeline-histogram-panel" style={{ position: 'absolute', left: '10px', top: '580px', width: '500px', height: '200px', backgroundColor: 'white', zIndex: 100 }}>
            <div style={{ height: '100%', padding: '10px' }}>
                <Bar data={chartData} options={options} />
            </div>
        </div>
    );
}

export default TimelineHistogramPanel;
