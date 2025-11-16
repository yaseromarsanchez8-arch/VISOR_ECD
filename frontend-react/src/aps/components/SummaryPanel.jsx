import React from 'react';
import { tryGetProperty } from '../utils/model';

function SummaryPanel({ properties }) {
    if (!properties) {
        return <div>Loading...</div>;
    }

    const numericProps = ['Area', 'Volume', 'Price', 'Density', 'Mass'];
    const calculations = {};

    for (const propName of numericProps) {
        const values = properties
            .map(p => tryGetProperty(p, propName))
            .filter(v => v !== null && !isNaN(v))
            .map(v => parseFloat(v));

        if (values.length > 0) {
            const sum = values.reduce((acc, val) => acc + val, 0);
            const avg = sum / values.length;
            const min = Math.min(...values);
            const max = Math.max(...values);
            calculations[propName] = {
                sum: sum.toFixed(2),
                avg: avg.toFixed(2),
                min: min.toFixed(2),
                max: max.toFixed(2),
            };
        }
    }

    return (
        <div className="summary-panel-content">
            <div className="property">
                <strong>Count</strong>
                <span>{properties.length}</span>
            </div>
            <hr />
            {Object.entries(calculations).map(([propName, values]) => (
                <div key={propName}>
                    <h5>{propName}</h5>
                    <div className="property">
                        <strong>Sum</strong>
                        <span>{values.sum}</span>
                    </div>
                    <div className="property">
                        <strong>Avg</strong>
                        <span>{values.avg}</span>
                    </div>
                    <div className="property">
                        <strong>Min</strong>
                        <span>{values.min}</span>
                    </div>
                    <div className="property">
                        <strong>Max</strong>
                        <span>{values.max}</span>
                    </div>
                    <hr />
                </div>
            ))}
        </div>
    );
}

export default SummaryPanel;
