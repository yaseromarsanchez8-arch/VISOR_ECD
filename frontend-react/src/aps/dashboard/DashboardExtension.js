import React from 'react';
import ReactDOM from 'react-dom';
import { DashboardPanel } from './DashboardPanel.jsx';
import { getAllPropertyNames, findPropertyValueOccurrences } from './DataHelper.js';

const { Autodesk } = window;

export class DashboardExtension extends Autodesk.Viewing.Extension {
    constructor(viewer, options) {
        super(viewer, options);
        this.panel = null;
        this.button = null;

        // Bind methods
        this.createUI = this.createUI.bind(this);
        this.onModelLoaded = this.onModelLoaded.bind(this);
        this.onSelectionChanged = this.onSelectionChanged.bind(this);
    }

    load() {
        this.viewer.addEventListener(Autodesk.Viewing.OBJECT_TREE_CREATED_EVENT, this.onModelLoaded);
        this.viewer.addEventListener(Autodesk.Viewing.SELECTION_CHANGED_EVENT, this.onSelectionChanged);
        this.createUI();
        console.log('DashboardExtension loaded.');
        return true;
    }

    unload() {
        this.viewer.removeEventListener(Autodesk.Viewing.OBJECT_TREE_CREATED_EVENT, this.onModelLoaded);
        this.viewer.removeEventListener(Autodesk.Viewing.SELECTION_CHANGED_EVENT, this.onSelectionChanged);
        this.removeUI();
        console.log('DashboardExtension unloaded.');
        return true;
    }

    createUI() {
        this.panel = new DashboardPanel(this.viewer);
        this.viewer.addPanel(this.panel);
        this.panel.setVisible(false);

        this.button = new Autodesk.Viewing.UI.Button('dashboard-button');
        this.button.onClick = () => {
            this.panel.setVisible(!this.panel.isVisible());
        };
        this.button.setToolTip('Dashboard');
        this.button.addClass('dashboard-button');

        const subToolbar = new Autodesk.Viewing.UI.ControlGroup('dashboard-toolbar');
        subToolbar.addControl(this.button);
        this.viewer.toolbar.addControl(subToolbar);
    }

    removeUI() {
        if (this.panel) {
            this.viewer.removePanel(this.panel);
            this.panel.uninitialize();
            this.panel = null;
        }
        if (this.button) {
            const subToolbar = this.viewer.toolbar.getControl('dashboard-toolbar');
            if (subToolbar) {
                subToolbar.removeControl(this.button);
                if (subToolbar.getNumberOfControls() === 0) {
                    this.viewer.toolbar.removeControl(subToolbar);
                }
            }
            this.button = null;
        }
    }

    async onModelLoaded(event) {
        const model = event.model;
        const propertyNames = await getAllPropertyNames(model);
        this.panel.render({ propertyNames });
    }

    async onSelectionChanged(event) {
        if (event.dbIdArray.length > 0) {
            const dbid = event.dbIdArray[0];
            const props = await this.viewer.getProperties(dbid);
            this.panel.render({ selectedProps: props });
        } else {
            this.panel.render({ selectedProps: null });
        }
    }

    async onChartClick(property, value) {
        const model = this.viewer.model;
        const histogram = await findPropertyValueOccurrences(model, property);
        const dbids = histogram.get(value);
        if (dbids) {
            this.viewer.isolate(dbids);
            this.viewer.fitToView(dbids);
        }
    }
}

Autodesk.Viewing.theExtensionManager.registerExtension('DashboardExtension', DashboardExtension);