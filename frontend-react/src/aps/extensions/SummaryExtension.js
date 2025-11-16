import React from 'react';
import ReactDOM from 'react-dom/client';
import SummaryPanel from '../components/SummaryPanel.jsx';

export class SummaryExtension extends Autodesk.Viewing.Extension {
    constructor(viewer, options) {
        super(viewer, options);
        this._panel = null;
        this._button = null;
        this._reactRoot = null;
        this.update = this.update.bind(this);
    }

    load() {
        console.log('SummaryExtension loaded.');
        this.viewer.addEventListener('model.loaded', this.update);
        this.viewer.addEventListener(Autodesk.Viewing.SELECTION_CHANGED_EVENT, this.update);
        this.viewer.addEventListener(Autodesk.Viewing.ISOLATE_EVENT, this.update);
        this.createUI();
        return true;
    }

    unload() {
        console.log('SummaryExtension unloaded.');
        this.viewer.removeEventListener('model.loaded', this.update);
        this.viewer.removeEventListener(Autodesk.Viewing.SELECTION_CHANGED_EVENT, this.update);
        this.viewer.removeEventListener(Autodesk.Viewing.ISOLATE_EVENT, this.update);
        this.removeUI();
        return true;
    }

    createUI() {
        this._button = new Autodesk.Viewing.UI.Button('summary-button');
        this._button.onClick = () => {
            if (!this._panel) {
                this._panel = new Autodesk.Viewing.UI.DockingPanel(this.viewer.container, 'summary-panel', 'Summary');
                this._panel.container.style.width = '300px';
                this._panel.container.style.height = '400px';
                this._panel.container.style.resize = 'auto';
                const div = document.createElement('div');
                div.style.height = '100%';
                this._panel.container.appendChild(div);
                this._reactRoot = ReactDOM.createRoot(div);
            }
            this._panel.setVisible(!this._panel.isVisible());
            if (this._panel.isVisible()) {
                this.update();
            }
        };
        this._button.setToolTip('Summary');
        const icon = this._button.icon;
        icon.style.backgroundImage = 'none';
        icon.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6z"/>
                <path d="M8 13h8v2H8zm0 4h8v2H8zm0-8h4v2H8z"/>
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
            targetIds = model.leafIds; // Assuming leafIds is populated by BaseExtension
        }

        if (!targetIds || targetIds.length === 0) {
            this._reactRoot.render(React.createElement(SummaryPanel, { properties: [] }));
            return;
        }

        // Assuming allProps is populated by BaseExtension
        const props = model.allProps.filter(p => targetIds.includes(p.dbId));
        this._reactRoot.render(React.createElement(SummaryPanel, { properties: props }));
    }
}
