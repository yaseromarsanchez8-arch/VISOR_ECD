
import React, { useState, useEffect, useRef } from 'react'; // Añadido useRef
import ReactDOM from 'react-dom';
import { Bar, Doughnut } from 'react-chartjs-2';
import { collectPhasingData, findPropertyValueOccurrences } from './DataHelper.js';
import './Dashboard.css';
import 'frappe-gantt/dist/frappe-gantt.css'; // Añadido CSS de Frappe Gantt
import Gantt from 'frappe-gantt'; // Importado Gantt

const { Autodesk } = window; // Esta línea ya no es necesaria aquí, pero la mantengo por ahora para no romper otras cosas si las hay.

// Nuevo componente para el diagrama de Gantt
const GanttChart = ({ tasks }) => {
    const ganttRef = useRef(null);

    useEffect(() => {
        if (ganttRef.current && tasks.length > 0) {
            new Gantt(ganttRef.current, tasks, {
                header_height: 50,
                column_width: 30,
                step: 24,
                view_modes: ['Quarter Day', 'Half Day', 'Day', 'Week', 'Month'],
                bar_height: 20,
                bar_corner_radius: 3,
                arrow_curve: 5,
                padding: 18,
                view_mode: 'Day',
                date_format: 'YYYY-MM-DD',
                language: 'es', // Cambiado a español
                on_click: function (task) {
                    console.log(task);
                },
                on_date_change: function (task, start, end) {
                    console.log(task, start, end);
                },
                on_progress_change: function (task, progress) {
                    console.log(task, progress);
                },
                on_view_change: function (mode) {
                    console.log(mode);
                }
            });
        }
    }, [tasks]);

    return <div ref={ganttRef}></div>;
};


function Dashboard({ viewer, propertyNames, selectedProps, panel }) {
    const [activeTab, setActiveTab] = useState('charts');
    console.log('Active Tab:', activeTab); // Añadido console.log
    const [charts, setCharts] = useState([]);
    const [phasing, setPhasing] = useState({ property: '', duration: 7, data: [], startDate: null, endDate: null, day: 0 });

    // Datos de ejemplo para el Gantt
    const sampleTasks = [
        {
            id: 'Task 1',
            name: 'Tarea de Ejemplo 1',
            start: '2023-01-01',
            end: '2023-01-05',
            progress: 50,
            dependencies: ''
        },
        {
            id: 'Task 2',
            name: 'Tarea de Ejemplo 2',
            start: '2023-01-06',
            end: '2023-01-10',
            progress: 20,
            dependencies: 'Task 1'
        }
    ];


    const addChart = () => setCharts([...charts, { property: '', type: 'bar', data: null }]);
    const removeChart = (index) => setCharts(charts.filter((_, i) => i !== index));

    const updateChart = async (index, property, type) => {
        const model = viewer.model;
        const histogram = await findPropertyValueOccurrences(model, property);
        const labels = Array.from(histogram.keys());
        const data = labels.map(label => histogram.get(label).length);
        const newCharts = [...charts];
        newCharts[index] = { property, type, data: { labels, datasets: [{ data }] } };
        setCharts(newCharts);
    };

    const runPhasing = async () => {
        const model = viewer.model;
        const data = await collectPhasingData(model, phasing.property, phasing.duration);
        if (data.length > 0) {
            const allDates = data.flatMap(d => [d.startDate, d.endDate]);
            const startDate = new Date(Math.min(...allDates));
            const endDate = new Date(Math.max(...allDates));
            setPhasing({ ...phasing, data, startDate, endDate, day: 0 });
        } else {
            setPhasing({ ...phasing, data: [], startDate: null, endDate: null, day: 0 });
        }
    };

    useEffect(() => {
        if (phasing.startDate && phasing.endDate) {
            viewer.isolate(phasing.data.map(d => d.dbid));
            viewer.clearThemingColors();
            const currentDate = new Date(phasing.startDate);
            currentDate.setDate(currentDate.getDate() + phasing.day);
            for (const item of phasing.data) {
                if (item.startDate > currentDate) {
                    viewer.hide(item.dbid);
                } else {
                    viewer.show(item.dbid);
                    const color = (item.endDate < currentDate)
                        ? new THREE.Vector4(0, 0.5, 1, 0.5) // Completed
                        : new THREE.Vector4(0, 0.8, 0, 0.5); // In Progress
                    viewer.setThemingColor(item.dbid, color);
                }
            }
        }
    }, [phasing.day]);

    return (
        <div className="dashboard">
            <div className="tabs">
                <button onClick={() => setActiveTab('charts')} className={activeTab === 'charts' ? 'active' : ''}>Charts</button>
                <button onClick={() => setActiveTab('phasing')} className={activeTab === 'phasing' ? 'active' : ''}>4D</button>
                <button onClick={() => setActiveTab('props')} className={activeTab === 'props' ? 'active' : ''}>Properties</button>
            </div>
            <div className="content">
                {activeTab === 'charts' && (
                    <div className="charts-grid">
                        {charts.map((chart, index) => (
                            <div key={index} className="chart-container">
                                <select value={chart.property} onChange={(e) => updateChart(index, e.target.value, chart.type)}>
                                    <option value="">Select Property</option>
                                    {propertyNames && propertyNames.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                                <select value={chart.type} onChange={(e) => updateChart(index, chart.property, e.target.value)}>
                                    <option value="bar">Bar</option>
                                    <option value="doughnut">Doughnut</option>
                                </select>
                                <button onClick={() => removeChart(index)}>Remove</button>
                                {chart.data && (chart.type === 'bar' ? <Bar data={chart.data} /> : <Doughnut data={chart.data} />)}
                            </div>
                        ))}
                        <button onClick={addChart}>Add Chart</button>
                    </div>
                )}
                {activeTab === 'phasing' && (
                    // Aquí se integra el GanttChart
                    <div className="gantt-container" style={{ border: '2px solid red', minHeight: '200px' }}> {/* Añadido estilo temporal */}
                        <GanttChart tasks={sampleTasks} />
                    </div>
                )}
                {activeTab === 'props' && (
                    <div className="properties-grid">
                        {selectedProps ? selectedProps.map(prop => (
                            <div key={prop.displayName} className="property">
                                <span>{prop.displayName}</span>
                                <span>{prop.displayValue}</span>
                            </div>
                        )) : <p>Select an object to see its properties.</p>}
                    </div>
                )}
            </div>
        </div>
    );
}

export class DashboardPanel extends Autodesk.Viewing.UI.DockingPanel {
    constructor(viewer, options) {
        super(viewer.container, 'dashboard-panel', 'Dashboard', options);
        this.viewer = viewer;
        this.container.style.left = '10px';
        this.container.style.top = '10px';
        this.container.style.width = '400px';
        this.container.style.height = '400px';
        this.container.style.resize = 'auto';
        this.reactProps = { viewer: this.viewer, propertyNames: [], selectedProps: null };
    }

    initialize() {
        this.mountPoint = document.createElement('div');
        this.container.appendChild(this.mountPoint);
        this.renderReactComponent();
    }

    uninitialize() {
        ReactDOM.unmountComponentAtNode(this.mountPoint);
    }

    setProps(newProps) {
        this.reactProps = { ...this.reactProps, ...newProps };
        this.renderReactComponent();
    }

    renderReactComponent() {
        ReactDOM.render(<Dashboard {...this.reactProps} panel={this} />, this.mountPoint);
    }
}
