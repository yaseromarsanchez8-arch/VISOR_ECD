import JSZip from 'jszip';
import { kml as kmlToGeoJSON } from '@tmcw/togeojson';
import { ensureGoogleMapsLoaded } from './utils/googleMapsLoader';

const DEFAULT_CENTER = { lat: 40.7484, lng: -73.9857 };
const DEFAULT_KML = window.__MAPS_DEFAULT_KML_URL || '/maps/demo.kml';

function resolveUrl(url) {
  if (!url) return '';
  try {
    if (/^https?:\/\//i.test(url)) return url;
    return new URL(url, window.location.origin).href;
  } catch {
    return url;
  }
}

function decodeKmlColor(kmlColor) {
  if (!kmlColor || kmlColor.length < 8) {
    return { color: '#ff0000', opacity: 1 };
  }
  const alpha = parseInt(kmlColor.slice(0, 2), 16) / 255;
  const blue = kmlColor.slice(2, 4);
  const green = kmlColor.slice(4, 6);
  const red = kmlColor.slice(6, 8);
  return {
    color: `#${red}${green}${blue}`,
    opacity: isNaN(alpha) ? 1 : alpha
  };
}

export default class GoogleMapsPanel extends Autodesk.Viewing.UI.DockingPanel {
  constructor(viewer) {
    super(viewer.container, 'google-maps-panel', 'Vista Google Maps');
    this.viewer = viewer;
    this.initialized = false;
    this.map = null;
    this.kmlUrl = resolveUrl(DEFAULT_KML);
    this.noticeEl = null;
    this.mapContainer = null;
    this.fileInput = null;
    this.infoWindow = null;
    this.labels = [];
  }

  initialize() {
    if (this.initialized) {
      this.setVisible(true);
      return;
    }
    this.initialized = true;
    while (this.container.firstChild) {
      this.container.removeChild(this.container.firstChild);
    }
    this.title = this.createTitleBar('Vista Google Maps');
    this.container.appendChild(this.title);
    this.initializeMoveHandlers(this.title);
    this.container.style.position = 'fixed';
    this.container.style.inset = '0';
    this.container.style.zIndex = '5000';
    this.container.style.resize = 'none';
    this.container.style.minWidth = '100%';
    this.container.style.minHeight = '100%';
    this.container.style.overflow = 'auto';
    this.container.style.background = '#fefefe';
    this.container.style.boxShadow = 'none';
    this.container.style.borderRadius = '0';

    const body = document.createElement('div');
    body.style.padding = '16px';
    body.style.display = 'flex';
    body.style.flexDirection = 'column';
    body.style.gap = '12px';
    this.container.appendChild(body);

    const chipRow = document.createElement('div');
    chipRow.style.display = 'flex';
    chipRow.style.gap = '10px';
    chipRow.style.flexWrap = 'wrap';
    const makeChip = (label) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.style.padding = '10px 14px';
      btn.style.borderRadius = '14px';
      btn.style.border = '1px solid #cbd5dc';
      btn.style.background = '#f3f4f6';
      btn.style.cursor = 'pointer';
      btn.style.fontSize = '13px';
      btn.style.fontWeight = '600';
      return btn;
    };
    chipRow.appendChild(makeChip('Fecha'));
    chipRow.appendChild(makeChip('Especialidad'));
    body.appendChild(chipRow);

    this.mapContainer = document.createElement('div');
    this.mapContainer.style.height = 'calc(100vh - 240px)';
    this.mapContainer.style.minHeight = '360px';
    this.mapContainer.style.border = '1px solid #d0d0d0';
    this.mapContainer.style.borderRadius = '8px';
    body.appendChild(this.mapContainer);

    this.ensureMapReady();
  }

  async ensureMapReady() {
    try {
      const maps = await ensureGoogleMapsLoaded();
      if (!this.map) {
        this.map = new maps.Map(this.mapContainer, {
          center: DEFAULT_CENTER,
          zoom: 12,
          mapTypeId: maps.MapTypeId.SATELLITE,
          streetViewControl: false,
          mapTypeControl: true,
          fullscreenControl: true
        });
        this.attachDataEvents();
      }
      this.loadKml(this.kmlUrl);
    } catch (err) {
      console.error('Google Maps error:', err);
      this.showNotice(err.message || 'No se pudo inicializar Google Maps.');
    }
  }

  async loadKml(url) {
    if (!this.map || !url) return;
    try {
      // Clear previous data layer features.
      this.map.data.forEach(feature => this.map.data.remove(feature));
      this.clearLabels();
      const response = await fetch(url);
      if (!response.ok) throw new Error('No se pudo descargar el archivo.');
      const lower = url.toLowerCase();
      let kmlText;
      if (lower.endsWith('.kmz')) {
        const arrayBuffer = await response.arrayBuffer();
        const zip = await JSZip.loadAsync(arrayBuffer);
        const entry = zip.file(/\.kml$/i)[0];
        if (!entry) throw new Error('El KMZ no contiene ningún archivo KML.');
        kmlText = await entry.async('text');
      } else {
        kmlText = await response.text();
      }
      const dom = new DOMParser().parseFromString(kmlText, 'text/xml');
      const styleIndex = this.extractStyles(dom);
      const placemarkMeta = this.extractPlacemarkMeta(dom, styleIndex);
      const geojson = kmlToGeoJSON(dom);
      if (!geojson?.features?.length) {
        throw new Error('El archivo no contiene geometrías válidas.');
      }
    const added = this.map.data.addGeoJson(geojson);
    added.forEach((feature, idx) => {
      const meta = placemarkMeta[idx] || {};
      feature.setProperty('__style', meta.style || null);
      feature.setProperty('__meta', { name: meta.name, description: meta.description, extendedData: meta.extendedData });
      if (meta.label && this.map) {
        this.createLabelOverlay(feature, meta.label);
      }
    });
      this.map.data.setStyle(feature => this.buildFeatureStyle(feature));
      this.fitDataLayerBounds(added);
      this.noticeEl.style.display = 'none';
    } catch (err) {
      console.error('Error interpretando el archivo KML/KMZ', err);
      this.showNotice(err.message || 'No se pudo interpretar el archivo.');
    }
  }

  extractStyles(dom) {
    const styles = {};
    dom.querySelectorAll('Style').forEach(styleEl => {
      const id = styleEl.getAttribute('id');
      if (!id) return;
      styles[id] = this.parseStyleElement(styleEl);
    });
    dom.querySelectorAll('StyleMap').forEach(mapEl => {
      const id = mapEl.getAttribute('id');
      if (!id) return;
      let target = null;
      mapEl.querySelectorAll('Pair').forEach(pair => {
        const key = pair.querySelector('key')?.textContent?.trim();
        if (key === 'normal') {
          target = pair.querySelector('styleUrl')?.textContent?.trim()?.replace(/^#/, '');
        }
      });
      if (target && styles[target]) {
        styles[id] = { ...styles[target] };
      }
    });
    return styles;
  }

  extractPlacemarkMeta(dom, styleIndex) {
    const placemarks = Array.from(dom.getElementsByTagName('Placemark'));
    return placemarks.map(pm => {
      let style = null;
      const inlineStyle = pm.querySelector(':scope > Style');
      if (inlineStyle) style = this.parseStyleElement(inlineStyle);
      const styleUrl = pm.querySelector(':scope > styleUrl')?.textContent?.trim() || '';
      if (!style && styleUrl) {
        const key = styleUrl.replace(/^#/, '');
        style = styleIndex[key] || null;
      }
      const name = pm.querySelector(':scope > name')?.textContent?.trim() || '';
      const description = pm.querySelector(':scope > description')?.textContent?.trim() || '';
      const labelStyle = this.parseLabelStyle(pm, styleUrl, styleIndex);
      const extendedData = this.parseExtendedData(pm);
      return {
        style,
        name,
        description,
        label: labelStyle ? { ...labelStyle, text: name || description } : null,
        extendedData
      };
    });
  }

  parseStyleElement(styleEl) {
    const style = {};
    const lineColor = styleEl.querySelector('LineStyle > color')?.textContent?.trim();
    if (lineColor) {
      const { color, opacity } = decodeKmlColor(lineColor);
      style.strokeColor = color;
      style.strokeOpacity = opacity;
    }
    const lineWidth = styleEl.querySelector('LineStyle > width')?.textContent?.trim();
    if (lineWidth) {
      style.strokeWeight = Number(lineWidth);
    }
    const polyColor = styleEl.querySelector('PolyStyle > color')?.textContent?.trim();
    if (polyColor) {
      const { color, opacity } = decodeKmlColor(polyColor);
      style.fillColor = color;
      style.fillOpacity = opacity;
    }
    const fill = styleEl.querySelector('PolyStyle > fill')?.textContent?.trim();
    if (fill === '0') style.fillOpacity = 0;
    const outline = styleEl.querySelector('PolyStyle > outline')?.textContent?.trim();
    if (outline === '0') style.strokeOpacity = 0;
    const iconHref = styleEl.querySelector('IconStyle > Icon > href')?.textContent?.trim();
    if (iconHref) {
      style.icon = iconHref;
    }
    const labelColor = styleEl.querySelector('LabelStyle > color')?.textContent?.trim();
    if (labelColor) {
      const { color, opacity } = decodeKmlColor(labelColor);
      style.labelColor = color;
      style.labelOpacity = opacity;
    }
    const labelScale = styleEl.querySelector('LabelStyle > scale')?.textContent?.trim();
    if (labelScale) {
      style.labelScale = Number(labelScale);
    }
    return style;
  }

  parseLabelStyle(pm, styleUrl, styleIndex) {
    let label = {};
    const inlineScale = pm.querySelector(':scope > Style > LabelStyle > scale')?.textContent?.trim();
    const inlineColor = pm.querySelector(':scope > Style > LabelStyle > color')?.textContent?.trim();
    if (inlineScale) label.scale = Number(inlineScale);
    if (inlineColor) {
      const { color, opacity } = decodeKmlColor(inlineColor);
      label.color = color;
      label.opacity = opacity;
    }
    if ((!label.scale || !label.color) && styleUrl) {
      const key = styleUrl.replace(/^#/, '');
      const style = styleIndex[key];
      if (style?.labelColor && !label.color) label.color = style.labelColor;
      if (style?.labelOpacity && label.opacity === undefined) label.opacity = style.labelOpacity;
      if (style?.labelScale && !label.scale) label.scale = style.labelScale;
    }
    if (!label.scale && !label.color) return null;
    return label;
  }

  parseExtendedData(pm) {
    const data = {};
    pm.querySelectorAll(':scope > ExtendedData > Data').forEach(node => {
      const name = node.getAttribute('name');
      const value = node.querySelector('value')?.textContent?.trim();
      if (name) data[name] = value;
    });
    pm.querySelectorAll(':scope > ExtendedData > SchemaData > SimpleData').forEach(node => {
      const name = node.getAttribute('name');
      const value = node.textContent?.trim();
      if (name) data[name] = value;
    });
    return data;
  }
  fitDataLayerBounds(features) {
    if (!features || !features.length) return;
    const bounds = new window.google.maps.LatLngBounds();
    features.forEach(feature => {
      feature.getGeometry().forEachLatLng(latlng => bounds.extend(latlng));
    });
    if (!bounds.isEmpty()) {
      this.map.fitBounds(bounds);
    }
  }

  buildFeatureStyle(feature) {
    const geometryType = feature.getGeometry().getType();
    const style = feature.getProperty('__style') || {};
    if (geometryType === 'Point' && style.icon) {
      return {
        icon: {
          url: style.icon,
          scaledSize: new window.google.maps.Size(24, 24)
        }
      };
    }
    const result = {
      strokeColor: style.strokeColor || '#ff0000',
      strokeOpacity: style.strokeOpacity ?? 1,
      strokeWeight: style.strokeWeight || 2,
      fillColor: style.fillColor || '#ff0000',
      fillOpacity: style.fillOpacity ?? 0.2
    };
    if (geometryType === 'LineString') {
      result.fillOpacity = 0;
    }
    return result;
  }

  getGeometryCenter(geometry) {
    const type = geometry.getType();
    if (type === 'Point') return geometry.get();
    const bounds = new window.google.maps.LatLngBounds();
    geometry.forEachLatLng(latlng => bounds.extend(latlng));
    if (!bounds.isEmpty()) return bounds.getCenter();
    return null;
  }

  attachDataEvents() {
    if (!this.map) return;
    this.infoWindow = new window.google.maps.InfoWindow();
    this.map.data.addListener('click', event => {
      const meta = event.feature.getProperty('__meta');
      if (!meta || (!meta.name && !meta.description)) return;
      const rows = meta.extendedData
        ? Object.entries(meta.extendedData)
            .map(([key, val]) => `<div><strong>${key}:</strong> ${val ?? ''}</div>`)
            .join('')
        : '';
      const name = meta.name ? `<h4 style="margin:0 0 4px 0;">${meta.name}</h4>` : '';
      const description = meta.description ? `<div>${meta.description}</div>` : '';
      this.infoWindow.setContent(`<div style="max-width:260px;">${name}${description}${rows}</div>`);
      this.infoWindow.setPosition(event.latLng);
      this.infoWindow.open(this.map);
    });
  }

  createLabelOverlay(feature, label) {
    if (!label?.text || !this.map) return;
    const position = this.getGeometryCenter(feature.getGeometry());
    if (!position) return;
    const map = this.map;
    const OverlayClass = window.google.maps.OverlayView;
    class LabelOverlay extends OverlayClass {
      constructor(pos, opts) {
        super();
        this.position = pos;
        this.opts = opts;
        this.div = null;
      }
      onAdd() {
        const div = document.createElement('div');
        div.style.position = 'absolute';
        div.style.transform = 'translate(-50%, -50%)';
        div.style.whiteSpace = 'nowrap';
        div.style.pointerEvents = 'none';
        div.style.fontWeight = 'bold';
        div.style.color = this.opts.color || '#ff0000';
        div.style.opacity = String(this.opts.opacity ?? 1);
        const scale = this.opts.scale || 1;
        div.style.fontSize = `${Math.min(28, 12 * scale)}px`;
        div.style.textShadow = '0 0 4px #000, 0 0 8px #000';
        div.textContent = this.opts.text;
        this.div = div;
        this.getPanes().floatPane.appendChild(div);
      }
      draw() {
        if (!this.div) return;
        const point = this.getProjection().fromLatLngToDivPixel(this.position);
        this.div.style.left = `${point.x}px`;
        this.div.style.top = `${point.y}px`;
      }
      onRemove() {
        if (this.div?.parentNode) this.div.parentNode.removeChild(this.div);
        this.div = null;
      }
    }
    const overlay = new LabelOverlay(position, label);
    overlay.setMap(map);
    this.labels.push(overlay);
  }

  clearLabels() {
    this.labels.forEach(label => label.setMap(null));
    this.labels = [];
  }

  async handleUpload() {
    const file = this.fileInput?.files?.[0];
    if (!file) {
      this.showNotice('Selecciona un archivo KML o KMZ antes de subir.');
      return;
    }
    try {
      this.showNotice('Subiendo archivo...');
      const form = new FormData();
      form.append('file', file);
      const response = await fetch('/api/maps/upload', {
        method: 'POST',
        body: form
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'No se pudo subir el archivo.');
      }
      if (!payload.url) {
        throw new Error('Respuesta inválida del servidor.');
      }
      const resolved = resolveUrl(payload.url);
      this.urlInput.value = resolved;
      this.kmlUrl = resolved;
      this.loadKml(resolved);
      this.showNotice('Archivo cargado correctamente.');
    } catch (err) {
      console.error('Upload error', err);
      this.showNotice(err.message || 'Error subiendo el archivo.');
    }
  }

  showNotice(message) {
    if (!this.noticeEl) return;
    this.noticeEl.style.display = 'block';
    this.noticeEl.textContent = message;
  }

  setSize(width, height) {
    super.setSize(width, height);
    if (this.mapContainer) {
      const newHeight = Math.max(height - 150, 220);
      this.mapContainer.style.height = `${newHeight}px`;
      if (this.map) {
        window.google.maps.event.trigger(this.map, 'resize');
      }
    }
  }

  uninitialize() {
    this.map = null;
    this.clearLabels();
    super.uninitialize();
  }
}
