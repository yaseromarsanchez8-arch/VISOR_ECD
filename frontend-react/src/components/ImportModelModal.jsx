import React, { useEffect, useState } from 'react';
import NativeFileTree from './NativeFileTree';

const ImportModelModal = ({ open, onClose, onConfirm }) => {
  const [selectedModel, setSelectedModel] = useState(null);
  const [label, setLabel] = useState('');

  useEffect(() => {
    if (!open) {
      setSelectedModel(null);
      setLabel('');
    }
  }, [open]);

  const handleSelect = (model) => {
    setSelectedModel(model);
    setLabel(model?.name || '');
  };

  const handleConfirm = () => {
    if (!selectedModel) return;
    onConfirm?.({ ...selectedModel, name: label || selectedModel.name });
  };

  if (!open) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-panel">
        <div className="modal-header">
          <h3>Import Model</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">
          <div className="modal-form">
            <label>
              Label
              <input
                type="text"
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="Structure, MEP, Interiors..."
              />
            </label>
            <p className="modal-hint">Select a version from Autodesk Docs to link it as an additional specialty.</p>
          </div>
          <div className="modal-tree">
            <NativeFileTree onFileSelect={handleSelect} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="modal-secondary" onClick={onClose}>Cancel</button>
          <button className="modal-primary" disabled={!selectedModel} onClick={handleConfirm}>Import</button>
        </div>
      </div>
    </div>
  );
};

export default ImportModelModal;
