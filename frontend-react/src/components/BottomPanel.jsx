import React, { useState, useEffect } from 'react';
import ChronosTimeline from './ChronosTimeline';

function BottomPanel({ isVisible }) {
    const [timelineData, setTimelineData] = useState(null);

    useEffect(() => {
        const handleUpdate = (e) => setTimelineData(e.detail);
        window.addEventListener('phasing-update-timeline', handleUpdate);
        return () => window.removeEventListener('phasing-update-timeline', handleUpdate);
    }, []);

    if (!isVisible) {
        return null;
    }

    const handleTimeRangeChanged = (start, end) => {
        console.log('Time range changed:', start, end);
    };

    const handleTimeMarkerChanged = (time) => {
        if (timelineData) {
            const dayOffset = (time - timelineData.projectStartDate) / (1000 * 60 * 60 * 24);
            window.dispatchEvent(new CustomEvent('phasing-update-simulation', { detail: { dayOffset } }));
        }
    };

    return (
        <div className="bottom-panel">
            {timelineData && (
                <ChronosTimeline
                    startDate={timelineData.projectStartDate}
                    endDate={timelineData.projectEndDate}
                    tasks={timelineData.phasingData}
                    onTimeRangeChanged={handleTimeRangeChanged}
                    onTimeMarkerChanged={handleTimeMarkerChanged}
                />
            )}
        </div>
    );
}

export default BottomPanel;
