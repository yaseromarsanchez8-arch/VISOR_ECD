import { findLeafNodes, getBulkProperties } from '../utils/model.js';

export class BaseExtension extends Autodesk.Viewing.Extension {
    constructor(viewer, options) {
        super(viewer, options);
        this.onObjectTreeCreated = this.onObjectTreeCreated.bind(this);
        this.onSelectionChanged = this.onSelectionChanged.bind(this);
        this.onIsolationChanged = this.onIsolationChanged.bind(this);
    }

    load() {
        this.viewer.addEventListener(Autodesk.Viewing.OBJECT_TREE_CREATED_EVENT, this.onObjectTreeCreated);
        this.viewer.addEventListener(Autodesk.Viewing.SELECTION_CHANGED_EVENT, this.onSelectionChanged);
        this.viewer.addEventListener(Autodesk.Viewing.ISOLATE_EVENT, this.onIsolationChanged);
        console.log('BaseExtension loaded.');
        return true;
    }

    unload() {
        this.viewer.removeEventListener(Autodesk.Viewing.OBJECT_TREE_CREATED_EVENT, this.onObjectTreeCreated);
        this.viewer.removeEventListener(Autodesk.Viewing.SELECTION_CHANGED_EVENT, this.onSelectionChanged);
        this.viewer.removeEventListener(Autodesk.Viewing.ISOLATE_EVENT, this.onIsolationChanged);
        console.log('BaseExtension unloaded.');
        return true;
    }

    async onObjectTreeCreated(ev) {
        console.log('Object tree created.');
        const model = ev.model;
        const leafIds = await findLeafNodes(model);
        this.viewer.model.leafIds = leafIds;
        try {
            this.viewer.model.allProps = await getBulkProperties(model, leafIds);
        } catch (error) {
            console.error('Bulk property extraction failed', error);
            this.viewer.model.allProps = [];
        }
        const detail = this.viewer.model.allProps || [];
        window.dispatchEvent(new CustomEvent('viewer-model-properties', { detail }));
        this.viewer.dispatchEvent({ type: 'model.loaded', model: this.viewer.model });
    }

    onSelectionChanged(ev) {
        this.viewer.dispatchEvent({ type: 'selection.changed', selection: ev.dbIdArray });
    }

    onIsolationChanged(ev) {
        this.viewer.dispatchEvent({ type: 'isolation.changed', isolation: ev.nodeIdArray });
    }
}
