import React from 'react';
import { ReactTabulator } from 'react-tabulator';
import 'tabulator-tables/dist/css/tabulator.min.css'; // Import Tabulator CSS

function DataGridPanel({ data, onRowClick }) {
    if (!data) {
        return <div>Loading...</div>;
    }

    const columns = [
        { title: 'Name', field: 'name', width: 150 },
        { title: 'Level', field: 'level' },
        { title: 'Area', field: 'area' },
        { title: 'Volume', field: 'volume' },
    ];

    const options = {
        height: '100%',
        layout: 'fitColumns',
        groupBy: 'level',
    };

    return (
        <ReactTabulator
            data={data}
            columns={columns}
            options={options}
            events={{
                rowClick: (e, row) => {
                    if (onRowClick) {
                        onRowClick(row.getData().dbId);
                    }
                },
            }}
        />
    );
}

export default DataGridPanel;
