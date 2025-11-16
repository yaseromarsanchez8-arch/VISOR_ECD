import React, { useEffect, useRef, useState } from 'react';
import './viewer.css';
import { BaseExtension } from '../aps/extensions/BaseExtension';
import { LoggerExtension } from '../aps/extensions/LoggerExtension';
import { HistogramExtension } from '../aps/extensions/HistogramExtension';
import { PhasingExtension } from '../aps/extensions/PhasingExtension';

const Viewer = ({ models, sprites, showSprites, activeSpriteId, onSpriteSelect, placementMode, onPlacementComplete, onModelProperties }) => {
    const viewerRef = useRef(null);
    const containerRef = useRef(null);
    const loadedModelsRef = useRef({});
    const baseOffsetRef = useRef(null);
    const basePlacementRef = useRef(null);
    const spriteViewRef = useRef(null);
    const spriteStylesRef = useRef(null);
    const spriteMeshesRef = useRef({});
    const [viewerReady, setViewerReady] = useState(false);

    const toMatrix4 = transform => {
        if (!window.THREE || !transform) return null;
        const matrix = new THREE.Matrix4();
        if (Array.isArray(transform)) {
            if (transform.length === 16) {
                matrix.set(
                    transform[0], transform[1], transform[2], transform[3],
                    transform[4], transform[5], transform[6], transform[7],
                    transform[8], transform[9], transform[10], transform[11],
                    transform[12], transform[13], transform[14], transform[15]
                );
                return matrix;
            }
            if (transform.length === 12) {
                matrix.set(
                    transform[0], transform[1], transform[2], transform[3],
                    transform[4], transform[5], transform[6], transform[7],
                    transform[8], transform[9], transform[10], transform[11],
                    0, 0, 0, 1
                );
                return matrix;
            }
        }
        if (transform.elements && transform.elements.length === 16) {
            matrix.fromArray(transform.elements);
            return matrix;
        }
        return null;
    };

    useEffect(() => {
        const initializeViewer = () => {
            const options = {
                env: 'AutodeskProduction',
                getAccessToken: (onSuccess) => {
                    fetch('/api/token')
                        .then(res => res.json())
                        .then(data => onSuccess(data.access_token, data.expires_in));
                }
            };

            Autodesk.Viewing.Initializer(options, () => {
                Autodesk.Viewing.theExtensionManager.registerExtension('BaseExtension', BaseExtension);
                Autodesk.Viewing.theExtensionManager.registerExtension('LoggerExtension', LoggerExtension);
                Autodesk.Viewing.theExtensionManager.registerExtension('HistogramExtension', HistogramExtension);
                Autodesk.Viewing.theExtensionManager.registerExtension('PhasingExtension', PhasingExtension);
                const config = {
                    extensions: ['BaseExtension', 'LoggerExtension', 'HistogramExtension', 'PhasingExtension']
                };
                const viewer = new Autodesk.Viewing.GuiViewer3D(containerRef.current, config);
                viewer.start();
                viewerRef.current = viewer;
                viewer.loadExtension('Autodesk.DataVisualization').then(dataviz => {
                    const spriteView = new dataviz.SpriteView(viewer);
                    const styleBuilder = new dataviz.SpriteStyleBuilder();
                    styleBuilder.addStyle('default', { color: '#ff5a5a', size: 24 });
                    styleBuilder.addStyle('active', { color: '#3aa0ff', size: 26 });
                    const styleSet = styleBuilder.build();
                    spriteView.on(dataviz.SpriteView.Events.CLICKED, evt => {
                        const spriteId = evt?.viewable?.id;
                        if (spriteId) {
                            onSpriteSelect?.(spriteId);
                        }
                    });
                    spriteViewRef.current = spriteView;
                    spriteStylesRef.current = styleSet;
                    setViewerReady(true);
                }).catch(() => setViewerReady(true));
            });
        };

        initializeViewer();

        return () => {
            spriteViewRef.current?.clear();
            if (viewerRef.current) {
                viewerRef.current.finish();
                viewerRef.current = null;
                setViewerReady(false);
            }
        };
    }, []);

    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !viewerReady) return;
        const handleModelLoaded = (event) => {
            const props = event?.model?.allProps || viewer?.model?.allProps || [];
            onModelProperties?.(props || []);
        };
        viewer.addEventListener('model.loaded', handleModelLoaded);
        // In case BaseExtension already populated props before we subscribed
        if (viewer?.model?.allProps?.length) {
            handleModelLoaded({ model: viewer.model });
        }
        return () => {
            viewer.removeEventListener('model.loaded', handleModelLoaded);
        };
    }, [viewerReady, onModelProperties]);

    useEffect(() => {
        if (models.length === 0) {
            onModelProperties?.([]);
        }
    }, [models.length, onModelProperties]);

    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !viewerReady) return;
        const navigation = viewer.getNavigation?.();
        if (!navigation) return;
        navigation.setReverseZoomDirection(false);
    }, [viewerReady, models]);

    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !viewerReady) return;
        const navigation = viewer.getNavigation?.();
        if (!navigation) return;

        navigation.setUsePivotAlways?.(true);
        navigation.setPivotVisible?.(false);

        const hidePivotAfterDelay = () => {
            if (navigation.setPivotVisible) {
                navigation.setPivotVisible(false);
            }
        };

        const canvas = viewer.canvas || viewer.impl?.canvas || viewer.container;
        const updatePivotFromEvent = event => {
            if (!canvas) return;
            const hit = viewer.impl?.hitTest(event.clientX, event.clientY, true);
            const pivot = hit?.intersectPoint || hit?.point;
            if (pivot) {
                navigation.setPivotPoint(pivot);
                navigation.setPivotVisible?.(true);
                if (viewer._pivotTimeout) {
                    clearTimeout(viewer._pivotTimeout);
                }
                viewer._pivotTimeout = setTimeout(hidePivotAfterDelay, 1500);
            }
        };

        const handleDoubleClick = event => updatePivotFromEvent(event);
        const handleMiddleClick = event => {
            if (event.button === 1) {
                event.preventDefault();
                updatePivotFromEvent(event);
            }
        };

        canvas?.addEventListener('dblclick', handleDoubleClick, true);
        canvas?.addEventListener('mousedown', handleMiddleClick, true);
        canvas?.addEventListener('auxclick', handleMiddleClick, true);

        return () => {
            canvas?.removeEventListener('dblclick', handleDoubleClick, true);
            canvas?.removeEventListener('mousedown', handleMiddleClick, true);
            canvas?.removeEventListener('auxclick', handleMiddleClick, true);
            if (viewer._pivotTimeout) {
                clearTimeout(viewer._pivotTimeout);
                viewer._pivotTimeout = null;
            }
        };
    }, [viewerReady]);

    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !viewerReady) return;
        const palette = [
            '#3AA0FF',
            '#F97316',
            '#10B981',
            '#F43F5E',
            '#A855F7',
            '#0EA5E9',
            '#EAB308'
        ].map(color => new THREE.Color(color));

        const handleFiltersApply = event => {
            const detail = event?.detail;
            viewer.clearThemingColors();
            if (!detail || !detail.dbIds || !detail.dbIds.length) {
                viewer.setGhosting(false);
                viewer.showAll();
                viewer.select([]);
                return;
            }
            viewer.setGhosting(true);
            viewer.showAll();
            viewer.select(detail.dbIds);
            detail.groups?.forEach((group, index) => {
                const color = palette[index % palette.length];
                group.dbIds.forEach(dbId => {
                    viewer.setThemingColor(dbId, color);
                });
            });
        };

        window.addEventListener('filters-apply', handleFiltersApply);
        return () => window.removeEventListener('filters-apply', handleFiltersApply);
    }, [viewerReady]);

    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !viewerReady) return;
        const loaded = loadedModelsRef.current;
        const targetUrns = models.map(model => model.urn);

        if (!models.length) {
            baseOffsetRef.current = null;
            basePlacementRef.current = null;
        }

        Object.entries(loaded).forEach(([urn, model]) => {
            if (!targetUrns.includes(urn)) {
                viewer.unloadModel(model);
                delete loadedModelsRef.current[urn];
            }
        });

        models.forEach(model => {
            if (!model?.urn || loaded[model.urn]) return;
            Autodesk.Viewing.Document.load(
                `urn:${model.urn}`,
                doc => {
                    const viewable = doc.getRoot().getDefaultGeometry();
                    const offset = viewable?.globalOffset || doc.getRoot()?.globalOffset || null;
                    const placementMatrix = toMatrix4(viewable?.placementTransform);
                    if (!basePlacementRef.current && placementMatrix) {
                        basePlacementRef.current = placementMatrix.clone();
                    }
                    if (!baseOffsetRef.current && offset) {
                        baseOffsetRef.current = { ...offset };
                    }
                    viewer.loadDocumentNode(doc, viewable, { keepCurrentModels: true }).then(loadedModel => {
                        loadedModelsRef.current[model.urn] = loadedModel;
                        const basePlacement = basePlacementRef.current;
                        if (basePlacement && placementMatrix) {
                            const inverse = placementMatrix.clone().invert();
                            const relative = new THREE.Matrix4().multiplyMatrices(basePlacement, inverse);
                            loadedModel.setModelTransform(relative);
                        } else {
                            const base = baseOffsetRef.current;
                            if (base && offset && window.THREE) {
                                const dx = (offset.x || 0) - (base.x || 0);
                                const dy = (offset.y || 0) - (base.y || 0);
                                const dz = (offset.z || 0) - (base.z || 0);
                                const translation = new THREE.Matrix4().makeTranslation(dx, dy, dz);
                                loadedModel.setModelTransform(translation);
                            }
                        }
                        if (Object.keys(loadedModelsRef.current).length === 1) {
                            viewer.fitToView();
                        }
                    }).catch(err => console.error('Error loading document node', err));
                },
                err => console.error('Error loading document', err)
            );
        });
    }, [models, viewerReady]);

    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !viewerReady) return;
        const overlayName = 'docs-sprites';
        const overlayManager = viewer.impl?.overlayManager;
        if (!overlayManager) return;
        if (!overlayManager.hasScene(overlayName)) {
            viewer.impl.createOverlayScene(overlayName);
        }
        Object.values(spriteMeshesRef.current).forEach(mesh => {
            viewer.impl.removeOverlay(overlayName, mesh);
        });
        spriteMeshesRef.current = {};
        if (!showSprites || !sprites.length) {
            viewer.impl.invalidate(true, true, true);
            return;
        }
        sprites.forEach(sprite => {
            const position = sprite.position || { x: 0, y: 0, z: 0 };
            const colorHex = sprite.id === activeSpriteId ? 0x3aa0ff : 0xff5a5a;
            const material = new THREE.SpriteMaterial({ color: colorHex, sizeAttenuation: false });
            const spriteMesh = new THREE.Sprite(material);
            spriteMesh.position.set(position.x, position.y, position.z);
            spriteMesh.scale.set(2, 2, 2);
            spriteMesh.userData.sprite = sprite;
            viewer.impl.addOverlay(overlayName, spriteMesh);
            spriteMeshesRef.current[sprite.id] = spriteMesh;
        });
        viewer.impl.invalidate(true, true, true);
    }, [sprites, showSprites, activeSpriteId, viewerReady]);

    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !viewerReady) return;
        if (!placementMode) {
            viewer.setCursor && viewer.setCursor('default');
            return;
        }
        viewer.setCursor && viewer.setCursor('crosshair');
        const target = viewer.canvas || viewer.impl?.canvas || viewer.container;
        if (!target) return;
        const handlePlacement = event => {
            event.stopPropagation();
            event.preventDefault();
            const rect = target.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            const hit = viewer.impl.hitTest(x, y, true);
            console.log('sprite placement', hit);
            if (hit && onPlacementComplete) {
                onPlacementComplete({
                    position: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
                    dbId: hit.dbId
                });
            } else if (onPlacementComplete) {
                onPlacementComplete(null);
            }
        };
        target.addEventListener('click', handlePlacement, true);
        return () => {
            target.removeEventListener('click', handlePlacement, true);
            viewer.setCursor && viewer.setCursor('default');
        };
    }, [placementMode, onPlacementComplete, viewerReady]);

    return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
};

export default Viewer;
