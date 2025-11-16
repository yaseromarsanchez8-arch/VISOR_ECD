import React from 'react';
import ReactDOM from 'react-dom/client';
import HistogramPanel from '../components/HistogramPanel.jsx';
import { tryGetProperty } from '../utils/model';

export class HistogramExtension extends Autodesk.Viewing.Extension {
    constructor(viewer, options) {
        super(viewer, options);
        this._panel = null;
        this._button = null;
        this._reactRoot = null;
        this._selectedProperty = 'Level'; // Default property
        this._availableProperties = [];

        this.update = this.update.bind(this);
        this.onBarClick = this.onBarClick.bind(this);
        this.onPropertyChange = this.onPropertyChange.bind(this);
    }

    load() {
        console.log('HistogramExtension loaded.');
        this.viewer.addEventListener('model.loaded', this.update);
        this.viewer.addEventListener(Autodesk.Viewing.SELECTION_CHANGED_EVENT, this.update);
        this.viewer.addEventListener(Autodesk.Viewing.ISOLATE_EVENT, this.update);
        this.createUI();
        return true;
    }

    unload() {
        console.log('HistogramExtension unloaded.');
        this.viewer.removeEventListener('model.loaded', this.update);
        this.viewer.removeEventListener(Autodesk.Viewing.SELECTION_CHANGED_EVENT, this.update);
        this.viewer.removeEventListener(Autodesk.Viewing.ISOLATE_EVENT, this.update);
        this.removeUI();
        return true;
    }

    createUI() {
        this._button = new Autodesk.Viewing.UI.Button('histogram-button');
        this._button.onClick = () => {
            if (!this._panel) {
                this._panel = new Autodesk.Viewing.UI.DockingPanel(this.viewer.container, 'histogram-panel', 'Histogram');
                this._panel.container.style.width = '400px';
                this._panel.container.style.height = '350px';
                this._panel.container.style.resize = 'auto';

                // Create a container for React content
                const reactContainer = document.createElement('div');
                reactContainer.style.height = 'calc(100% - 50px)'; // Adjust for the select dropdown
                reactContainer.style.position = 'relative';

                // Create the select dropdown
                const selectContainer = document.createElement('div');
                selectContainer.style.padding = '10px';
                selectContainer.innerHTML = `
                    <label for="histogram-property-select">Property:</label>
                    <select id="histogram-property-select"></select>
                `;

                this._panel.container.appendChild(selectContainer);
                this._panel.container.appendChild(reactContainer);
                this._reactRoot = ReactDOM.createRoot(reactContainer);

                this._selectElement = this._panel.container.querySelector('#histogram-property-select');
                this._selectElement.addEventListener('change', this.onPropertyChange);
            }
            this._panel.setVisible(!this._panel.isVisible());
            if (this._panel.isVisible()) {
                this.update();
            }
        };
        this._button.setToolTip('Histogram');
        const icon = this._button.icon;
        icon.style.backgroundImage = 'none';
        icon.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M5 9.2h3V19H5zM10.6 5h3v14h-3zm5.6 8h3v6h-3z"/>
            </svg>
        `;

        const toolbar = this.viewer.toolbar.getControl('dashboard-toolbar') || new Autodesk.Viewing.UI.ControlGroup('dashboard-toolbar');
        toolbar.addControl(this._button);
        this.viewer.toolbar.addControl(toolbar);
    }

    removeUI() {
        if (this._button) {
            const toolbar = this.viewer.toolbar.getControl('dashboard-toolbar');
            toolbar.removeControl(this._button);
        }
        if (this._panel) {
            this._panel.uninitialize();
            this._panel = null;
        }
    }

    onPropertyChange(event) {
        this._selectedProperty = event.target.value;
        this.update();
    }

    onBarClick(dbIds) {
        this.viewer.isolate(dbIds);
        this.viewer.fitToView(dbIds);
    }

    async update() {
        if (!this._panel || !this._panel.isVisible() || !this.viewer.model) {
            return;
        }

        const model = this.viewer.model;
        if (model.allProps && this._availableProperties.length === 0) {
            const propNames = new Set();
            for (const prop of model.allProps) {
                for (const p of prop.properties) {
                    propNames.add(p.displayName);
                }
            }
            this._availableProperties = Array.from(propNames).sort();
            this._selectElement.innerHTML = this._availableProperties.map(p => `<option value="${p}" ${p === this._selectedProperty ? 'selected' : ''}>${p}</option>`).join('');
        }

        const isolatedIds = this.viewer.getIsolatedNodes();
        const selectedIds = this.viewer.getSelection();

        let targetIds = [];
        if (selectedIds.length > 0) {
            targetIds = selectedIds;
        } else if (isolatedIds.length > 0) {
            targetIds = isolatedIds;
        } else {
            targetIds = model.leafIds;
        }

        if (!targetIds || targetIds.length === 0) {
            this._reactRoot.render(React.createElement(HistogramPanel, { data: { labels: [], values: [] }, onBarClick: this.onBarClick }));
            return;
        }

        const allModelProps = model.allProps;
        const props = allModelProps.filter(p => targetIds.includes(p.dbId));

        const histogram = new Map();
        for (const prop of props) {
            const value = tryGetProperty(prop, this._selectedProperty);
            if (value !== null && value !== undefined && value !== '') {
                if (!histogram.has(value)) {
                    histogram.set(value, []);
                }
                histogram.get(value).push(prop.dbId);
            }
        }

        const labels = Array.from(histogram.keys());
        const values = labels.map(label => ({
            y: histogram.get(label).length,
            dbIds: histogram.get(label)
        }));

        this._reactRoot.render(React.createElement(HistogramPanel, { data: { labels, values }, onBarClick: this.onBarClick }));
    }
}
