import React, { useState, useEffect, useRef } from 'react';

function SettingsPanel({ isVisible, onToggle }) {
    const [propertyNames, setPropertyNames] = useState([]);
    const [selectedProperty, setSelectedProperty] = useState('');
    const [duration, setDuration] = useState(7);
    const [tasks, setTasks] = useState([]);
    const [position, setPosition] = useState({ x: 100, y: 100 });
    const [isDragging, setIsDragging] = useState(false);
    const dragStartPos = useRef(null);
    const panelRef = useRef(null);

    useEffect(() => {
        const handleProperties = (e) => {
            const detail = Array.isArray(e.detail) ? e.detail : [];
            const names = detail.map(item => (typeof item === 'string' ? item : item.name)).filter(Boolean);
            setPropertyNames(names);
        };
        const handleTasks = (e) => setTasks(e.detail);

        window.addEventListener('phasing-properties', handleProperties);
        window.addEventListener('phasing-tasks', handleTasks);

        if (isVisible) {
            window.dispatchEvent(new CustomEvent('phasing-get-properties'));
        }

        return () => {
            window.removeEventListener('phasing-properties', handleProperties);
            window.removeEventListener('phasing-tasks', handleTasks);
        };
    }, [isVisible]);

    const handleGo = () => {
        window.dispatchEvent(new CustomEvent('phasing-go', { detail: { property: selectedProperty, duration } }));
    };

    const onMouseDown = (e) => {
        setIsDragging(true);
        dragStartPos.current = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e) => {
        if (!isDragging) return;
        const dx = e.clientX - dragStartPos.current.x;
        const dy = e.clientY - dragStartPos.current.y;
        setPosition({
            x: position.x + dx,
            y: position.y + dy,
        });
        dragStartPos.current = { x: e.clientX, y: e.clientY };
    };

    const onMouseUp = () => {
        setIsDragging(false);
        dragStartPos.current = null;
    };

    if (!isVisible) {
        return null;
    }

    const panelStyle = {
        position: 'absolute',
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: 100,
        backgroundColor: 'rgba(50, 50, 50, 0.95)',
        border: '1px solid #888',
        borderRadius: '5px',
        width: '450px',
        color: '#f0f0f0',
        display: 'flex',
        flexDirection: 'column',
    };

    const headerStyle = {
        padding: '10px',
        cursor: 'move',
        backgroundColor: '#333',
        borderBottom: '1px solid #888',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
    };

    const contentStyle = {
        padding: '15px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
    };

    return (
        <div
            ref={panelRef}
            style={panelStyle}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
        >
            <div style={headerStyle} onMouseDown={onMouseDown}>
                <h3>4D Phasing Settings</h3>
                <button onClick={onToggle} style={{ background: 'none', border: 'none', color: '#f0f0f0', fontSize: '1.2em' }}>X</button>
            </div>
            <div style={contentStyle}>
                <div className="settings-grid">
                    <label htmlFor="property-select">Date Property:</label>
                    <select id="property-select" value={selectedProperty} onChange={(e) => setSelectedProperty(e.target.value)}>
                        {propertyNames.map(prop => <option key={prop} value={prop}>{prop}</option>)}
                    </select>

                    <label htmlFor="duration-input">Duration (days):</label>
                    <input type="number" id="duration-input" value={duration} onChange={(e) => setDuration(parseInt(e.target.value))} />

                    <span></span>
                    <button id="go-button" onClick={handleGo}>Go</button>
                </div>
                <div className="task-list" style={{ height: '200px', overflowY: 'auto' }}>
                    <div className="task-list-header">
                        <div className="task-col-name">Task Name</div>
                        <div className="task-col-date">Start</div>
                        <div className="task-col-date">End</div>
                    </div>
                    {tasks.map(task => (
                        <div key={task.dbid} className="task-list-item">
                            <div className="task-col-name" title={task.name}>{task.name}</div>
                            <div className="task-col-date">{task.startDate.toLocaleDateString()}</div>
                            <div className="task-col-date">{task.endDate.toLocaleDateString()}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default SettingsPanel;
