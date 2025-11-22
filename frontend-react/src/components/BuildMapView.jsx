import React, { useEffect, useRef, useState } from 'react';
import './BuildMapView.css';

const BuildMapView = ({
    userLocation,
    pins = [],
    selectedPinId,
    onPinCreated,
    onPinSelect,
    onPinDelete,
    onPinUpdate,
    onFileUpload
}) => {
    const mapContainerRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const markersRef = useRef({});
    const fileInputRef = useRef(null);
    const cameraInputRef = useRef(null);

    // Refs for callbacks
    const onPinCreatedRef = useRef(onPinCreated);
    const onPinSelectRef = useRef(onPinSelect);
    const onPinDeleteRef = useRef(onPinDelete);
    const onPinUpdateRef = useRef(onPinUpdate);
    const pinsRef = useRef(pins);

    // State
    const [contextMenu, setContextMenu] = useState(null); // { visible, x, y, type: 'create'|'existing', latLng?, pinId?, pinName? }
    const [showUploadOptions, setShowUploadOptions] = useState(false); // Toggle for + button options
    const [galleryPinId, setGalleryPinId] = useState(null); // ID of pin to show gallery for
    const [previewImageUrl, setPreviewImageUrl] = useState(null);
    const [showCamera, setShowCamera] = useState(false);
    const [cameraPinId, setCameraPinId] = useState(null);
    const [cameraStream, setCameraStream] = useState(null);
    const videoRef = useRef(null);
    const streamRef = useRef(null); // Keep ref for cleanup

    const longPressTimerRef = useRef(null);
    const isLongPressRef = useRef(false);

    // Camera functions
    const openCamera = async (pinId) => {
        console.log('📷 Opening camera for pin:', pinId);
        setCameraPinId(pinId);
        setShowCamera(true);
        setContextMenu(null);

        try {
            console.log('📷 Requesting camera access...');
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }, // Use back camera on mobile
                audio: false
            });
            console.log('📷 Camera access granted!', stream);
            streamRef.current = stream;
            setCameraStream(stream); // Trigger re-render and effect
        } catch (err) {
            console.error('❌ Error accessing camera:', err);
            alert('No se pudo acceder a la cámara. Por favor, verifica los permisos.');
            setShowCamera(false);
        }
    };

    // Connect stream to video when it's ready
    useEffect(() => {
        console.log('📷 useEffect - showCamera:', showCamera, 'stream:', !!cameraStream, 'video:', !!videoRef.current);
        if (showCamera && cameraStream && videoRef.current) {
            console.log('📷 Connecting stream to video element');
            videoRef.current.srcObject = cameraStream;
            videoRef.current.play().catch(e => console.error('Error playing video:', e));
        }
    }, [showCamera, cameraStream]);

    const capturePhoto = () => {
        if (!videoRef.current || !cameraPinId) return;

        const video = videoRef.current;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);

        canvas.toBlob((blob) => {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const file = new File([blob], `photo-${timestamp}.jpg`, { type: 'image/jpeg' });

            console.log('📸 Photo captured! Uploading to pin:', cameraPinId);

            // Upload the captured photo
            if (onFileUpload) {
                onFileUpload(file, cameraPinId);
            }

            closeCamera();
        }, 'image/jpeg', 0.9);
    };

    const closeCamera = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        setCameraStream(null);
        setShowCamera(false);
        setCameraPinId(null);
    };

    // Cleanup camera on unmount
    useEffect(() => {
        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
        };
    }, []);

    // Update refs
    useEffect(() => {
        onPinCreatedRef.current = onPinCreated;
        onPinSelectRef.current = onPinSelect;
        onPinDeleteRef.current = onPinDelete;
        onPinUpdateRef.current = onPinUpdate;
        pinsRef.current = pins;
    }, [onPinCreated, onPinSelect, onPinDelete, onPinUpdate, pins]);

    // Close menu on outside click
    useEffect(() => {
        const handleClickOutside = () => {
            setContextMenu(null);
            setShowUploadOptions(false);
        };
        window.addEventListener('click', handleClickOutside);
        return () => window.removeEventListener('click', handleClickOutside);
    }, []);

    // Initialize Map
    useEffect(() => {
        if (!userLocation || !mapContainerRef.current) return;
        if (mapInstanceRef.current) return;

        let isMounted = true;

        const initMap = () => {
            if (!window.googleMapsLoaded || !window.google?.maps) {
                setTimeout(initMap, 300);
                return;
            }

            if (!isMounted || mapInstanceRef.current) return;

            console.log('🗺️ Initializing map...');

            const map = new window.google.maps.Map(mapContainerRef.current, {
                center: userLocation,
                zoom: 17,
                mapTypeId: 'satellite',
                streetViewControl: false,
                mapTypeControl: true,
                fullscreenControl: true,
                zoomControl: true,
                disableDefaultUI: false,
                clickableIcons: false
            });

            // User location marker
            new window.google.maps.Marker({
                position: userLocation,
                map: map,
                icon: {
                    path: window.google.maps.SymbolPath.CIRCLE,
                    scale: 8,
                    fillColor: '#4285F4',
                    fillOpacity: 1,
                    strokeColor: '#ffffff',
                    strokeWeight: 2
                },
                title: 'Tu ubicación'
            });

            // --- Event Handlers ---

            const openCreateMenu = (latLng, pixel) => {
                setContextMenu({
                    visible: true,
                    x: pixel.x,
                    y: pixel.y,
                    type: 'create',
                    latLng: { lat: latLng.lat(), lng: latLng.lng() }
                });
                setShowUploadOptions(false);
            };

            // 1. Right Click (Desktop) -> Open Create Menu
            map.addListener('rightclick', (event) => {
                if (event.pixel) {
                    openCreateMenu(event.latLng, event.pixel);
                }
            });

            // 2. Long Press (Mobile/Tablet) -> Open Create Menu
            map.addListener('mousedown', (event) => {
                if (event.domEvent && event.domEvent.button === 2) return;

                isLongPressRef.current = false;
                longPressTimerRef.current = setTimeout(() => {
                    isLongPressRef.current = true;
                    if (event.pixel) {
                        openCreateMenu(event.latLng, event.pixel);
                    }
                }, 800);
            });

            map.addListener('mouseup', () => {
                if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
            });
            map.addListener('dragstart', () => {
                if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
            });
            map.addListener('click', (event) => {
                if (isLongPressRef.current) {
                    isLongPressRef.current = false;
                    event.stop();
                }
            });

            mapInstanceRef.current = map;
        };

        setTimeout(initMap, 500);

        return () => { isMounted = false; };
    }, [userLocation]);

    // Sync Markers
    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!map || !window.google?.maps) return;

        pins.forEach((pin, index) => {
            if (markersRef.current[pin.id]) {
                // Update existing
                const marker = markersRef.current[pin.id];
                const isSelected = pin.id === selectedPinId;
                const color = isSelected ? '#F59E0B' : '#10B981';
                const scale = isSelected ? 14 : 10;

                if (marker.getIcon().fillColor !== color) {
                    marker.setIcon({
                        path: window.google.maps.SymbolPath.CIRCLE,
                        scale: scale,
                        fillColor: color,
                        fillOpacity: 1,
                        strokeColor: '#ffffff',
                        strokeWeight: 2
                    });
                    marker.setZIndex(isSelected ? 1000 : 1);
                }

                // Ensure position is up to date (just in case state changed)
                const currentPos = marker.getPosition();
                const newLat = typeof pin.position.lat === 'function' ? pin.position.lat() : pin.position.lat;
                const newLng = typeof pin.position.lng === 'function' ? pin.position.lng() : pin.position.lng;

                if (Math.abs(currentPos.lat() - newLat) > 0.000001 || Math.abs(currentPos.lng() - newLng) > 0.000001) {
                    marker.setPosition(pin.position);
                }

                return;
            }

            // Create New Marker
            const isSelected = pin.id === selectedPinId;
            const color = isSelected ? '#F59E0B' : '#10B981';

            const marker = new window.google.maps.Marker({
                position: pin.position,
                map: map,
                icon: {
                    path: window.google.maps.SymbolPath.CIRCLE,
                    scale: isSelected ? 14 : 10,
                    fillColor: color,
                    fillOpacity: 1,
                    strokeColor: '#ffffff',
                    strokeWeight: 2
                },
                title: pin.name,
                label: {
                    text: String(index + 1),
                    color: 'white',
                    fontWeight: 'bold',
                    fontSize: '12px'
                },
                zIndex: isSelected ? 1000 : 1
            });

            // Marker Click -> Show "Ver / +" Menu
            marker.addListener('click', (event) => {
                // Stop propagation
                if (event.domEvent) {
                    event.domEvent.stopPropagation();
                    event.domEvent.preventDefault(); // Prevent ghost clicks
                }
                event.stop();

                // Select the pin
                if (onPinSelectRef.current) {
                    onPinSelectRef.current(pin.id);
                }

                // Calculate position relative to container
                let x = 0;
                let y = 0;

                if (event.domEvent && mapContainerRef.current) {
                    const rect = mapContainerRef.current.getBoundingClientRect();
                    // Handle both Mouse and Touch events if possible
                    const clientX = event.domEvent.clientX || (event.domEvent.touches?.[0]?.clientX) || (event.domEvent.changedTouches?.[0]?.clientX);
                    const clientY = event.domEvent.clientY || (event.domEvent.touches?.[0]?.clientY) || (event.domEvent.changedTouches?.[0]?.clientY);

                    if (clientX !== undefined && clientY !== undefined) {
                        x = clientX - rect.left;
                        y = clientY - rect.top;
                    } else if (event.pixel) {
                        x = event.pixel.x;
                        y = event.pixel.y;
                    }
                } else if (event.pixel) {
                    x = event.pixel.x;
                    y = event.pixel.y;
                }

                setContextMenu({
                    visible: true,
                    x: x,
                    y: y,
                    type: 'existing',
                    pinId: pin.id,
                    pinName: pin.name
                });
                setShowUploadOptions(false);
            });

            markersRef.current[pin.id] = marker;
        });

        // Cleanup removed markers
        Object.keys(markersRef.current).forEach(id => {
            if (!pins.find(p => p.id === id)) {
                markersRef.current[id].setMap(null);
                delete markersRef.current[id];
            }
        });

    }, [pins, selectedPinId]);

    // Refresh URLs when gallery opens
    // Track which documents have been refreshed to avoid infinite loops
    const refreshedDocsRef = useRef(new Set());

    useEffect(() => {
        if (!galleryPinId) return;

        const pin = pins.find(p => p.id === galleryPinId);
        if (!pin || !pin.documents) return;

        const refreshUrls = async () => {
            console.log('🔄 Refreshing URLs for pin:', pin.name);
            console.log('📄 Documents:', pin.documents);

            let hasUpdates = false;
            const updatedDocs = await Promise.all(pin.documents.map(async (doc) => {
                console.log('Checking doc:', doc.name, 'storageId:', doc.storageId, 'current url:', doc.url);

                // Only refresh if we have storageId and haven't refreshed this doc yet
                if (doc.storageId && !refreshedDocsRef.current.has(doc.storageId)) {
                    try {
                        const requestUrl = `/api/build/get-signed-url?storageId=${encodeURIComponent(doc.storageId)}`;
                        console.log('🌐 Fetching:', requestUrl);

                        const res = await fetch(requestUrl);
                        console.log('📡 Response status:', res.status);

                        if (res.ok) {
                            const data = await res.json();
                            console.log('✅ Response data:', data);

                            if (data.url && data.url !== doc.url) {
                                console.log('🔄 Updating URL for:', doc.name);
                                hasUpdates = true;
                                refreshedDocsRef.current.add(doc.storageId);
                                return { ...doc, url: data.url };
                            }
                        } else {
                            const errorText = await res.text();
                            console.error('❌ Error response:', errorText);
                        }
                    } catch (e) {
                        console.error('❌ Error refreshing URL for doc:', doc.name, e);
                    }
                } else if (!doc.storageId) {
                    console.warn('⚠️ No storageId for doc:', doc.name);
                }
                return doc;
            }));

            console.log('Has updates:', hasUpdates);
            if (hasUpdates && onPinUpdateRef.current) {
                console.log('✅ Updating pin with new URLs');
                onPinUpdateRef.current({
                    ...pin,
                    documents: updatedDocs
                });
            }
        };

        refreshUrls();
    }, [galleryPinId]); // Only depend on galleryPinId, not on pins


    // --- Actions ---

    const handleCreatePin = () => {
        if (!contextMenu?.latLng) return;

        const pinNumber = (pins.length || 0) + 1;
        const newPin = {
            id: `pin-${Date.now()}`,
            name: `Punto ${pinNumber}`,
            position: contextMenu.latLng,
            createdAt: new Date().toISOString(),
            documents: []
        };

        if (onPinCreatedRef.current) {
            onPinCreatedRef.current(newPin);
        }
        setContextMenu(null);
    };

    const handleDeletePin = () => {
        if (contextMenu?.pinId && onPinDeleteRef.current) {
            if (window.confirm('¿Estás seguro de que quieres eliminar este punto y todas sus fotos?')) {
                onPinDeleteRef.current(contextMenu.pinId);
                setContextMenu(null);
            }
        }
    };

    const handleDeleteDocument = async (doc) => {
        if (!activeGalleryPin) return;

        if (window.confirm(`¿Eliminar "${doc.name}"?`)) {
            // 1. Call backend to delete from ACC
            if (doc.itemId || doc.versionId) {
                try {
                    const idParam = doc.itemId ? `itemId=${encodeURIComponent(doc.itemId)}` : `versionId=${encodeURIComponent(doc.versionId)}`;
                    console.log('🗑️ Deleting from ACC:', idParam);
                    const res = await fetch(`/api/build/delete-file?${idParam}`, {
                        method: 'DELETE'
                    });

                    if (!res.ok) {
                        const err = await res.json();
                        console.error('❌ Error deleting from ACC:', err);
                        // We continue to delete locally even if ACC fails
                    } else {
                        console.log('✅ Deleted from ACC successfully');
                    }
                } catch (e) {
                    console.error('❌ Exception deleting from ACC:', e);
                    alert('Error de conexión al eliminar de ACC');
                }
            }

            // 2. Update local state
            const updatedDocs = activeGalleryPin.documents.filter(d => d.id !== doc.id);
            const updatedPin = { ...activeGalleryPin, documents: updatedDocs };

            if (onPinUpdateRef.current) {
                onPinUpdateRef.current(updatedPin);
            }
        }
    };

    const handleToggleUploadOptions = (e) => {
        e.stopPropagation();
        setShowUploadOptions(!showUploadOptions);
    };

    const handleUploadFile = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
        setContextMenu(null);
    };

    const handleCameraUpload = () => {
        if (contextMenu?.pinId) {
            openCamera(contextMenu.pinId);
        }
    };

    const handleViewGallery = () => {
        if (contextMenu?.pinId) {
            setGalleryPinId(contextMenu.pinId);
        }
        setContextMenu(null);
    };

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            if (onFileUpload) {
                // If we have a pin context, pass it
                const pinId = contextMenu?.pinId || galleryPinId;
                onFileUpload(e.target.files[0], pinId);
            }
        }
        e.target.value = '';
    };

    const activeGalleryPin = pins.find(p => p.id === galleryPinId);

    return (
        <div className="build-map-container" style={{ position: 'relative', width: '100%', height: '100%' }}>
            <div ref={mapContainerRef} className="build-map-view" />

            {/* Hidden File Inputs */}
            <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                accept="image/*,application/pdf"
                onChange={handleFileChange}
            />
            {/* Camera Input (Mobile) */}
            <input
                type="file"
                ref={cameraInputRef}
                style={{ display: 'none' }}
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
            />

            {/* Context Menu */}
            {contextMenu && contextMenu.visible && (
                <div
                    className="map-context-menu"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {contextMenu.type === 'create' ? (
                        // Phase 1: Only Create Button
                        <div className="ctx-row">
                            <button onClick={handleCreatePin} className="ctx-btn-primary">
                                Crear
                                <small>Álbum de fotos</small>
                            </button>
                        </div>
                    ) : (
                        // Phase 2: Existing Pin -> View & + & Delete
                        <div className="ctx-row">
                            <button onClick={handleViewGallery} className="ctx-btn-primary blue">
                                Ver
                                <small>{contextMenu.pinName}</small>
                            </button>

                            <div className="ctx-upload-wrapper">
                                <button
                                    onClick={handleToggleUploadOptions}
                                    className={`ctx-btn-icon ${showUploadOptions ? 'active' : ''}`}
                                >
                                    +
                                </button>

                                {showUploadOptions && (
                                    <div className="ctx-upload-options">
                                        <button onClick={handleUploadFile} title="Subir Archivo">
                                            📁
                                        </button>
                                        <button onClick={handleCameraUpload} title="Tomar Foto">
                                            📷
                                        </button>
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={handleDeletePin}
                                className="ctx-btn-icon delete"
                                title="Eliminar Punto"
                            >
                                🗑️
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Floating Gallery */}
            {activeGalleryPin && (
                <div className="map-gallery-overlay">
                    <div className="map-gallery-card">
                        <header>
                            <h3>{activeGalleryPin.name}</h3>
                            <button onClick={() => setGalleryPinId(null)}>×</button>
                        </header>
                        <div className="map-gallery-content">
                            {activeGalleryPin.documents && activeGalleryPin.documents.length > 0 ? (
                                <ul className="gallery-list">
                                    {activeGalleryPin.documents.map(doc => {
                                        const isImage = doc.url && (doc.name.match(/\.(jpg|jpeg|png|gif|webp)$/i) || doc.type?.startsWith('image/'));
                                        return (
                                            <li key={doc.id} className="gallery-item">
                                                {isImage ? (
                                                    <div
                                                        className="doc-thumbnail"
                                                        onClick={() => setPreviewImageUrl(doc.url)}
                                                    >
                                                        <img
                                                            src={doc.url}
                                                            alt={doc.name}
                                                            onError={(e) => {
                                                                e.target.style.display = 'none';
                                                                e.target.parentElement.innerHTML = '<span class="doc-icon">📄</span>';
                                                            }}
                                                        />
                                                        <div className="thumbnail-overlay">
                                                            <span>Ver</span>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <span className="doc-icon">📄</span>
                                                )}
                                                <div className="doc-info">
                                                    <strong>{doc.name}</strong>
                                                    <small>{new Date(doc.timestamp).toLocaleString()}</small>
                                                </div>
                                                <button
                                                    className="delete-doc-btn"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDeleteDocument(doc);
                                                    }}
                                                    title="Eliminar archivo"
                                                >
                                                    🗑️
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            ) : (
                                <div className="gallery-empty">
                                    <p>No hay fotos ni documentos.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Image Preview Modal */}
            {previewImageUrl && (
                <div className="image-preview-modal" onClick={() => setPreviewImageUrl(null)}>
                    <div className="image-preview-content" onClick={(e) => e.stopPropagation()}>
                        <img src={previewImageUrl} alt="Preview" />
                        <button className="close-preview" onClick={() => setPreviewImageUrl(null)}>×</button>
                    </div>
                </div>
            )}

            {/* Camera Capture Modal */}
            {showCamera && (
                <div className="camera-modal" onClick={closeCamera}>
                    <div className="camera-content" onClick={(e) => e.stopPropagation()}>
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            className="camera-preview"
                        />
                        <div className="camera-controls">
                            <button onClick={capturePhoto} className="capture-btn">
                                📸 Capturar Foto
                            </button>
                            <button onClick={closeCamera} className="cancel-btn">
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BuildMapView;
