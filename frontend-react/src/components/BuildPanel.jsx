import React from 'react';
import './BuildPanel.css';

const BuildPanel = ({
    buildUploads, // Legacy prop, might remove later
    pins,
    selectedPinId,
    onPinSelect,
    onFileUpload,
    uploading,
    uploadError
}) => {
    const selectedPin = pins.find(p => p.id === selectedPinId);

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            onFileUpload(e.target.files[0]);
        }
    };

    return (
        <div className="build-panel">
            <header className="build-panel-header">
                <div>
                    <p className="build-panel-title">Seguimiento de Obra</p>
                    <span className="build-panel-subtitle">
                        {pins.length} puntos registrados
                    </span>
                </div>
                <button
                    className="aps-login-btn"
                    onClick={() => window.location.href = '/api/auth/login'}
                    title="Conectar con Autodesk Construction Cloud"
                    style={{
                        background: '#0696D7',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        marginLeft: 'auto'
                    }}
                >
                    🔑 Conectar
                </button>
            </header>

            <div className="build-panel-info">
                {!selectedPin ? (
                    <p className="build-instruction">
                        🗺️ Haz click en el mapa para crear o seleccionar un punto.
                    </p>
                ) : (
                    <div className="selected-pin-info">
                        <strong>📍 {selectedPin.name}</strong>
                        <small>Seleccionado</small>
                    </div>
                )}
            </div>

            {pins.length > 0 && (
                <div className="pins-list-simple">
                    <h4>Puntos Creados</h4>
                    <ul>
                        {pins.map((pin, index) => (
                            <li
                                key={pin.id}
                                className={pin.id === selectedPinId ? 'selected' : ''}
                                onClick={() => onPinSelect(pin.id)}
                            >
                                <span className="pin-number">{index + 1}</span>
                                <div>
                                    <strong>{pin.name}</strong>
                                    <small>{new Date(pin.createdAt).toLocaleDateString('es-ES')}</small>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="build-upload-section">
                <label className={`build-upload-btn ${!selectedPin ? 'disabled' : ''}`}>
                    <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.webp,.svg,.doc,.docx,.xls,.xlsx,.kml,.kmz,.rvt,.dwg"
                        onChange={handleFileChange}
                        disabled={uploading || !selectedPin}
                    />
                    <span>{uploading ? 'Subiendo…' : '📤 Cargar Documentos'}</span>
                </label>
                {!selectedPin && <small className="upload-hint">Selecciona un punto primero</small>}
                {uploadError && <p className="build-upload-error">{uploadError}</p>}
            </div>

            {selectedPin && selectedPin.documents && selectedPin.documents.length > 0 && (
                <div className="build-docs-list">
                    <h4>Documentos de {selectedPin.name} ({selectedPin.documents.length})</h4>
                    <ul>
                        {selectedPin.documents.map(doc => (
                            <li key={doc.id}>
                                <span className="doc-icon">📄</span>
                                <div>
                                    <strong>{doc.name}</strong>
                                    <small>{new Date(doc.timestamp).toLocaleString()}</small>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

export default BuildPanel;
