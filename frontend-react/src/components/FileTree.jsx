import React, { useEffect, useRef } from 'react';
import $ from 'jquery';
import 'jstree';
import 'jstree/dist/themes/default/style.css';

function FileTree({ onFileSelect }) {
    const treeRef = useRef(null);

    useEffect(() => {
        const tree = $(treeRef.current);

        tree.jstree({
            'core': {
                'themes': { 'icons': true },
                'data': function (node, cb) {
                    const url = node.id === '#' ? '/api/hubs' : node.original.url;
                    fetch(url)
                        .then(response => response.json())
                        .then(data => {
                            if (data && data.data) {
                                const nodes = data.data.map(item => {
                                    const node = {
                                        id: item.id,
                                        text: item.attributes.displayName || item.attributes.name,
                                        type: item.type,
                                        children: item.type !== 'versions' && item.type !== 'items',
                                        url: null
                                    };
                                    if (item.type !== 'versions') {
                                        let projectId;
                                        switch (item.type) {
                                            case 'hubs':
                                                node.url = `/api/hubs/${item.id}/projects`;
                                                break;
                                            case 'projects':
                                                node.url = `/api/projects/${item.id}/topFolders`;
                                                break;
                                            case 'folders':
                                                projectId = item.links.self.href.match(/projects\/(b\.[a-zA-Z0-9\-_]+)/)[1];
                                                node.url = `/api/projects/${projectId}/folders/${item.id}/contents`;
                                                break;
                                            case 'items':
                                                projectId = item.links.self.href.match(/projects\/(b\.[a-zA-Z0-9\-_]+)/)[1];
                                                node.url = `/api/projects/${projectId}/items/${item.id}/versions`;
                                                break;
                                        }
                                    }
                                    return node;
                                });
                                cb(nodes);
                            } else {
                                cb([]);
                            }
                        })
                        .catch(error => {
                            console.error('Error fetching tree data:', error);
                            cb([]);
                        });
                }
            },
            'types': {
                'default': { 'icon': 'jstree-folder' },
                'hubs': { 'icon': 'jstree-folder' },
                'projects': { 'icon': 'jstree-folder' },
                'folders': { 'icon': 'jstree-folder' },
                'items': { 'icon': 'jstree-file' }
            },
            'plugins': ['types']
        }).on('select_node.jstree', function (e, data) {
            if (data.node.type === 'items') {
                // Prevent re-triggering select_node
                if (data.event) {
                    fetch(data.node.original.url)
                        .then(response => response.json())
                        .then(versions => {
                            if (versions && versions.data && versions.data.length > 0) {
                                const latestVersion = versions.data[versions.data.length - 1];
                                onFileSelect(latestVersion.id);
                            }
                        })
                        .catch(error => console.error('Error fetching versions for item:', error));
                }
            }
        });

        return () => {
            if (tree.jstree(true)) {
                tree.jstree(true).destroy();
            }
        };
    }, [onFileSelect]);

    return <div ref={treeRef} />;
}

export default FileTree;