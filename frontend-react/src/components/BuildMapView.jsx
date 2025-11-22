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
                // Ignore right click
                if (event.domEvent && event.domEvent.button === 2) return;

                // STRICT: Ignore if multi-touch (2+ fingers)
                if (event.domEvent && event.domEvent.touches && event.domEvent.touches.length > 1) {
                    return;
                }

                isLongPressRef.current = false;
                longPressTimerRef.current = setTimeout(() => {
                    // Double check we are still single touch (in case a second finger landed during the wait)
                    // Note: we can't easily check current touches here without a global tracker, 
                    // but the dragstart/move listeners should have cleared the timer if that happened.
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
            // Add touchmove listener to container to cancel on small drags/multi-touch
            if (mapContainerRef.current) {
                mapContainerRef.current.addEventListener('touchmove', () => {
                    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                }, { passive: true });
            }

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

    // ... (Sync Markers code remains same) ...

    // --- Actions ---

    // ... (handleCreatePin, handleDeletePin, handleDeleteDocument remain same) ...

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
        // Use native device camera input (much more reliable on mobile)
        if (cameraInputRef.current) {
            cameraInputRef.current.click();
        }
        setContextMenu(null);
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
