import React, { useMemo, useState, useEffect } from 'react';

const DocumentPanel = ({
  documents,
  sprites = [],
  activeSpriteId,
  showSprites,
  spritePlacementActive,
  onSelectSprite,
  onAddClick,
  onRemove,
  onToggleSprites,
  onRequestSprite
}) => {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!documents.length) {
      setSelected(null);
    } else if (selected && !documents.find(doc => doc.id === selected.id)) {
      setSelected(null);
    }
  }, [documents, selected]);

  const documentsForSprite = useMemo(() => {
    if (!activeSpriteId) return documents;
    return documents.filter(doc => doc.spriteId === activeSpriteId);
  }, [documents, activeSpriteId]);

  const filtered = useMemo(() => {
    if (!search.trim()) return documentsForSprite;
    const term = search.toLowerCase();
    return documentsForSprite.filter(doc => doc.name.toLowerCase().includes(term));
  }, [documentsForSprite, search]);

  useEffect(() => {
    if (selected && !documentsForSprite.find(doc => doc.id === selected.id)) {
      setSelected(null);
    }
  }, [documentsForSprite, selected]);

  const spriteDocCounts = useMemo(() => {
    const map = {};
    documents.forEach(doc => {
      const key = doc.spriteId || 'unassigned';
      map[key] = (map[key] || 0) + 1;
    });
    return map;
  }, [documents]);

  const openDocument = doc => {
    if (doc.url) {
      window.open(doc.url, '_blank');
      return;
    }
    if (doc.href) {
      window.open(doc.href, '_blank');
      return;
    }
    alert('No se pudo abrir el documento.');
  };

  return (
    <div className="docs-panel">
      <header className="docs-header">
        <div>
          <h3>Documents</h3>
          <span className="badge">{documentsForSprite.length}</span>
        </div>
        <button className="link-button" onClick={onAddClick}>+ Add Documents</button>
      </header>
      <div className="sprite-controls">
        <button className={showSprites ? 'active' : ''} onClick={onToggleSprites}>
          {showSprites ? 'Hide Sprites' : 'Show Sprites'}
        </button>
        <button className={spritePlacementActive ? 'active' : ''} onClick={onRequestSprite}>
          {spritePlacementActive ? 'Click on model…' : '+ Add sprite'}
        </button>
      </div>
      <div className="sprite-list">
        <button
          className={!activeSpriteId ? 'active' : ''}
          onClick={() => onSelectSprite(null)}
        >
          All ({documents.length})
        </button>
        {sprites.map(sprite => (
          <button
            key={sprite.id}
            className={activeSpriteId === sprite.id ? 'active' : ''}
            onClick={() => onSelectSprite(sprite.id)}
          >
            {sprite.name} ({spriteDocCounts[sprite.id] || 0})
          </button>
        ))}
      </div>
      <div className="docs-search">
        <input
          type="text"
          placeholder="Search documents"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div className="docs-scroll">
        {filtered.length === 0 ? (
          <div className="docs-empty">
            <div className="docs-folder-icon" />
            <p>There are no documents in your facility yet.</p>
            <button className="add-docs-button" onClick={onAddClick}>+ Add documents</button>
          </div>
        ) : (
          <ul className="docs-accordion">
            {filtered.map(doc => (
              <li key={doc.id} className={selected?.id === doc.id ? 'active' : ''}>
                <button className="accordion-trigger" onClick={() => setSelected(doc)}>
                  <span>
                    {doc.name}
                    <small>{doc.source === 'upload' ? 'Local upload' : 'Autodesk Docs link'}</small>
                  </span>
                  <span className="trigger-icon">⋯</span>
                </button>
                {selected?.id === doc.id && (
                  <div className="accordion-body">
                    <div className="doc-toolbar">
                      {doc.url && (
                        <button onClick={() => openDocument(doc)} title="Open">↗</button>
                      )}
                      <button onClick={() => onRemove(doc)} title="Remove">🗑</button>
                    </div>
                    {doc.url && doc.type?.includes('pdf') ? (
                      <iframe title={doc.name} src={doc.url} className="doc-preview-frame" />
                    ) : (
                      <div className="doc-preview-placeholder">
                        <p>{doc.message || 'Preview not available.'}</p>
                        <button onClick={() => openDocument(doc)}>
                          Open externally
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default DocumentPanel;
