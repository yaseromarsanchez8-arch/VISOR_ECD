import React from 'react';
import ReactDOM from 'react-dom/client';
import DataGridPanel from '../components/DataGridPanel.jsx';
import { tryGetProperty } from '../utils/model';

export class DataGridExtension extends Autodesk.Viewing.Extension {
    constructor(viewer, options) {
        super(viewer, options);
        this._panel = null;
        this._button = null;
        this._reactRoot = null;

        this.update = this.update.bind(this);
        this.onRowClick = this.onRowClick.bind(this);
    }

    load() {
        console.log('DataGridExtension loaded.');
        this.viewer.addEventListener('model.loaded', this.update);
        this.viewer.addEventListener(Autodesk.Viewing.SELECTION_CHANGED_EVENT, this.update);
        this.viewer.addEventListener(Autodesk.Viewing.ISOLATE_EVENT, this.update);
        this.createUI();
        return true;
    }

    unload() {
        console.log('DataGridExtension unloaded.');
        this.viewer.removeEventListener('model.loaded', this.update);
        this.viewer.removeEventListener(Autodesk.Viewing.SELECTION_CHANGED_EVENT, this.update);
        this.viewer.removeEventListener(Autodesk.Viewing.ISOLATE_EVENT, this.update);
        this.removeUI();
        return true;
    }

    createUI() {
        this._button = new Autodesk.Viewing.UI.Button('datagrid-button');
        this._button.onClick = () => {
            if (!this._panel) {
                this._panel = new Autodesk.Viewing.UI.DockingPanel(this.viewer.container, 'datagrid-panel', 'Data Grid');
                this._panel.container.style.width = '600px';
                this._panel.container.style.height = '400px';
                this._panel.container.style.resize = 'auto';

                const div = document.createElement('div');
                div.style.height = '100%';
                div.style.position = 'relative';
                this._panel.container.appendChild(div);
                this._reactRoot = ReactDOM.createRoot(div);
            }
            this._panel.setVisible(!this._panel.isVisible());
            if (this._panel.isVisible()) {
                this.update();
            }
        };
        this._button.setToolTip('Data Grid');
        const icon = this._button.icon;
        icon.style.backgroundImage = 'none';
        icon.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M4 4h16v4H4zm0 6h16v4H4zm0 6h16v4H4z"/>
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

    onRowClick(dbId) {
        this.viewer.isolate([dbId]);
        this.viewer.fitToView([dbId]);
    }

    async update() {
        if (!this._panel || !this._panel.isVisible() || !this.viewer.model) {
            return;
        }

        const model = this.viewer.model;
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
            this._reactRoot.render(React.createElement(DataGridPanel, { data: [], onRowClick: this.onRowClick }));
            return;
        }

        const allModelProps = model.allProps;
        const props = allModelProps.filter(p => targetIds.includes(p.dbId));

        const data = props.map(p => ({
            dbId: p.dbId,
            name: p.name,
            level: tryGetProperty(p, 'Level'),
            area: tryGetProperty(p, 'Area'),
            volume: tryGetProperty(p, 'Volume'),
        }));

        this._reactRoot.render(React.createElement(DataGridPanel, { data: data, onRowClick: this.onRowClick }));
    }
}
