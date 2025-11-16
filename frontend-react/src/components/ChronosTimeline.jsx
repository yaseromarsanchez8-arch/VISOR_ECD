import React, { useEffect, useRef } from 'react';

function ChronosTimeline({ startDate, endDate, tasks, onTimeRangeChanged, onTimeMarkerChanged }) {
    const containerRef = useRef(null);
    const timelineRef = useRef(null);

    useEffect(() => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chronos-etu@7.0.0/chronos-etu.min.js';
        script.async = true;
        script.onload = () => {
            if (containerRef.current && !timelineRef.current) {
                const debounce = (func, timeout = 500) => {
                    let timer;
                    return (...args) => {
                        clearTimeout(timer);
                        timer = setTimeout(() => { func.apply(this, args); }, timeout);
                    };
                };

                const timeslider = new ChronosEtu.TimeSlider(
                    containerRef.current.clientWidth,
                    containerRef.current.clientHeight,
                    startDate.toISOString(),
                    endDate.toISOString()
                );

                timeslider.on('appready', () => {
                    timeslider.off('appready');
                    containerRef.current.innerHTML = ''; // Clear any previous content
                    containerRef.current.appendChild(timeslider.view());
                    timelineRef.current = timeslider;

                    if (tasks) {
                        const highlights = tasks.map(task => ({
                            start: task.startDate.toISOString(),
                            end: task.endDate.toISOString(),
                            color: '#00ff00', // Green
                            label: task.name,
                        }));
                        if (timeslider.setHighlights) {
                            timeslider.setHighlights(highlights);
                        }
                    }
                });

                timeslider.on('tscreated', debounce((ev) => onTimeRangeChanged(new Date(ev.start), new Date(ev.end))));
                timeslider.on('tsmodifying', debounce((ev) => onTimeRangeChanged(new Date(ev.start), new Date(ev.end))));
                timeslider.on('tsmodified', debounce((ev) => onTimeRangeChanged(new Date(ev.start), new Date(ev.end))));
                timeslider.on('timemarkerchanged', debounce((ev) => onTimeMarkerChanged(new Date(ev.time))));
                timeslider.on('playbackmarkerchanged', (ev) => onTimeMarkerChanged(new Date(ev.time)));
            }
        };
        document.body.appendChild(script);

        return () => {
            if (document.body.contains(script)) {
                document.body.removeChild(script);
            }
        };
    }, [startDate, endDate, tasks, onTimeRangeChanged, onTimeMarkerChanged]);

    return <div ref={containerRef} style={{ width: '100%', height: '100px' }} />;
}

export default ChronosTimeline;
