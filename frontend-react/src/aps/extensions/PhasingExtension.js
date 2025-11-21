import Gantt from 'frappe-gantt';
import GoogleMapsPanel from './GoogleMapsPanel';

const DEFAULT_PANEL_OPTIONS = { x: 10, y: 10, width: 640, height: 420 };
const BULK_CHUNK_SIZE = 400;

const phasing_config = {
  tasks: [],
  objects: {},
  weeklySaves: {},
  activeSave: 'Semana actual',
  mapTasksToProps: {},
  propMappings: {
    id: '',
    name: '',
    startDate: '',
    endDate: '',
    progress: '',
    dependencies: ''
  },
  viewModes: ['Day', 'Week', 'Month'],
  statusColors: {
    finished: '31,246,14',
    inProgress: '235,246,14',
    late: '246,55,14',
    notYetStarted: '200,200,200',
    advanced: '14,28,246'
  }
};

const MAPPING_FIELDS = [
  { key: 'id', label: 'Task ID', required: true },
  { key: 'name', label: 'Task Name', required: false },
  { key: 'startDate', label: 'Start Date', required: true },
  { key: 'endDate', label: 'End Date', required: true },
  { key: 'progress', label: 'Progress (%)', required: false },
  { key: 'dependencies', label: 'Dependencies', required: false }
];

function parseDate(value) {
  if (!value) return null;
  const formats = [
    v => new Date(v),
    v => {
      const match = String(v).trim().match(/^(\d{4})(\d{2})(\d{2})$/);
      if (!match) return null;
      return new Date(`${match[1]}-${match[2]}-${match[3]}`);
    },
    v => {
      const match = String(v).trim().match(/^(\d{2,4})\.(\d{1,2})\.(\d{1,2})$/);
      if (!match) return null;
      let year = Number(match[1]);
      if (year < 100) year += year >= 50 ? 1900 : 2000;
      return new Date(`${year}-${match[2]}-${match[3]}`);
    }
  ];
  for (const fn of formats) {
    const date = fn(value);
    if (date && !Number.isNaN(date.getTime())) return date;
  }
  return null;
}

function parseProgress(value) {
  if (value === undefined || value === null || value === '') return 0;
  const num = Number(String(value).match(/-?\d+(?:\.\d+)?/));
  if (Number.isNaN(num)) return 0;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function parseDependencies(value) {
  if (!value) return '';
  if (Array.isArray(value)) return value.join(',');
  return String(value).replace(/[;|/]/g, ',').replace(/\s+/g, '');
}

function findPropValue(properties, displayName) {
  if (!displayName) return null;
  const prop = properties.find(p => p.displayName === displayName);
  return prop ? (prop.displayValue ?? null) : null;
}

function formatISO(date) {
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

class PhasingPanel extends Autodesk.Viewing.UI.DockingPanel {
  constructor(extension, id, title, options = {}) {
    const merged = { ...DEFAULT_PANEL_OPTIONS, ...options };
    super(extension.viewer.container, id, title, merged);
    this.extension = extension;
    this.options = merged;
    this.currentViewMode = 'Day';
    this.gantt = null;
    this.messageEl = null;
    this.simulationDate = null;
    this.simulationTimer = null;
    this.simulationStep = 24 * 60 * 60 * 1000;
    this.loadingScenario = false;
    this.simulationMarker = null;
    this.isDraggingMarker = false;
    this.rangeStart = null;
    this.rangeEnd = null;
    this.rangeSelectionStart = null;
    this.rangeHighlight = null;
    this.timelineBounds = null;
    this.lastPointerPosition = null;
    this.simulationSpeed = 1;

    this.container.style.left = `${merged.x}px`;
    this.container.style.top = `${merged.y}px`;
    this.container.style.width = `${merged.width}px`;
    this.container.style.height = `${merged.height}px`;
    this.container.style.resize = 'both';
    this.container.style.overflow = 'auto';
    this.container.style.backgroundColor = 'white';
    this.container.style.color = '#222';
    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
  }

  initialize() {
    this.title = this.createTitleBar(this.titleLabel || this.container.id);
    this.title.style.overflow = 'auto';
    this.initializeMoveHandlers(this.title);
    this.container.appendChild(this.title);

    this.toolbarWrapper = document.createElement('div');
    this.toolbarWrapper.style.position = 'sticky';
    this.toolbarWrapper.style.top = '0';
    this.toolbarWrapper.style.zIndex = '11';
    this.toolbarWrapper.style.background = '#fff';
    this.toolbarWrapper.style.borderBottom = '1px solid #ddd';
    this.container.appendChild(this.toolbarWrapper);

    this.toolbar = document.createElement('div');
    this.toolbar.style.display = 'flex';
    this.toolbar.style.flexWrap = 'wrap';
    this.toolbar.style.alignItems = 'center';
    this.toolbar.style.gap = '8px';
    this.toolbar.style.padding = '8px';
    this.toolbar.style.color = '#222';
    this.toolbarWrapper.appendChild(this.toolbar);

    this.configureBtn = this.createButton('Configurar parámetros', () => this.openMappingDialog());
    this.refreshBtn = this.createButton('Actualizar Gantt', () => this.refresh());
    this.exportBtn = this.createButton('Exportar CSV', () => this.exportCSV());
    this.toolbar.appendChild(this.configureBtn);
    this.toolbar.appendChild(this.refreshBtn);
    this.toolbar.appendChild(this.exportBtn);

    this.dropdown = document.createElement('select');
    this.dropdown.style.padding = '6px';
    this.dropdown.style.borderRadius = '6px';
    this.dropdown.style.border = '1px solid #bbb';
    this.dropdown.style.background = '#fff';
    this.dropdown.style.color = '#222';
    phasing_config.viewModes.forEach(mode => {
      const option = document.createElement('option');
      option.value = mode;
      option.textContent = mode;
      this.dropdown.appendChild(option);
    });
    this.dropdown.onchange = () => this.changeViewMode(this.dropdown.value);
    this.toolbar.appendChild(this.dropdown);

    this.checkbox = document.createElement('input');
    this.checkbox.type = 'checkbox';
    this.checkbox.id = 'phasing-show-phases';
    this.checkbox.onchange = () => this.handleColors();
    this.toolbar.appendChild(this.checkbox);

    const label = document.createElement('label');
    label.textContent = 'Show Phases';
    label.setAttribute('for', 'phasing-show-phases');
    label.style.color = '#222';
    this.toolbar.appendChild(label);

    this.toolbar.appendChild(this.createDockIcon('left'));
    this.toolbar.appendChild(this.createDockIcon('bottom'));

    const savesLabel = document.createElement('span');
    savesLabel.textContent = 'Guardado semanal:';
    savesLabel.style.fontSize = '12px';
    savesLabel.style.color = '#666';
    savesLabel.style.marginLeft = '8px';
    this.toolbar.appendChild(savesLabel);

    this.weeklySaveSelect = document.createElement('select');
    this.weeklySaveSelect.style.padding = '6px';
    this.weeklySaveSelect.style.borderRadius = '6px';
    this.weeklySaveSelect.style.border = '1px solid #bbb';
    this.weeklySaveSelect.onchange = () => this.loadWeeklySave(this.weeklySaveSelect.value);
    this.toolbar.appendChild(this.weeklySaveSelect);

    this.saveWeeklyBtn = this.createButton('Guardar avance', () => this.promptSaveWeekly());
    this.toolbar.appendChild(this.saveWeeklyBtn);

    const simLabel = document.createElement('span');
    simLabel.textContent = 'Simulación 4D:';
    simLabel.style.fontSize = '12px';
    simLabel.style.color = '#666';
    simLabel.style.marginLeft = '12px';
    this.toolbar.appendChild(simLabel);

    this.simPlayBtn = this.createButton('Reproducir', () => this.toggleSimulation());
    this.toolbar.appendChild(this.simPlayBtn);

    const speedLabel = document.createElement('span');
    speedLabel.textContent = 'Velocidad:';
    speedLabel.style.fontSize = '12px';
    speedLabel.style.color = '#666';
    speedLabel.style.marginLeft = '8px';
    this.toolbar.appendChild(speedLabel);

    this.simSpeedSelect = document.createElement('select');
    this.simSpeedSelect.style.padding = '4px';
    this.simSpeedSelect.style.borderRadius = '6px';
    this.simSpeedSelect.style.border = '1px solid #bbb';
    [1, 2, 3, 4, 8, 16].forEach(mult => {
      const opt = document.createElement('option');
      opt.value = String(mult);
      opt.textContent = `${mult}x`;
      this.simSpeedSelect.appendChild(opt);
    });
    this.simSpeedSelect.onchange = () => this.onSimulationSpeedChange();
    this.toolbar.appendChild(this.simSpeedSelect);

    this.simSlider = document.createElement('input');
    this.simSlider.type = 'range';
    this.simSlider.style.minWidth = '180px';
    this.simSlider.disabled = true;
    this.simSlider.oninput = () => this.onSimulationSliderChange();
    this.toolbar.appendChild(this.simSlider);

    this.clearRangeBtn = this.createButton('Limpiar rango', () => this.clearPlaybackRange());
    this.toolbar.appendChild(this.clearRangeBtn);

    this.body = document.createElement('div');
    this.body.style.display = 'block';
    this.body.style.flex = 'initial';
    this.container.appendChild(this.body);
    this.messageEl = null;

    this.scrollHost = document.createElement('div');
    this.scrollHost.style.flex = 'initial';
    this.scrollHost.style.overflow = 'visible';
    this.scrollHost.style.padding = '0 8px 8px';
    this.scrollHost.style.position = 'relative';
    this.body.appendChild(this.scrollHost);
    this.scrollContainer = this.scrollHost;

    this.content = document.createElement('div');
    this.content.style.backgroundColor = 'white';
    this.content.style.minHeight = '100%';
    this.content.style.paddingTop = '0';
    this.content.innerHTML = '<svg id="phasing-container"></svg>';
    this.scrollHost.appendChild(this.content);

    this.updateWeeklySaveOptions(phasing_config.activeSave);
    this.updateSimulationRange([]);
  }

  createButton(label, handler) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.padding = '6px 10px';
    btn.style.borderRadius = '6px';
    btn.style.border = '1px solid #bbb';
    btn.style.background = '#fff';
    btn.style.color = '#222';
    btn.onclick = handler;
    return btn;
  }

  createDockIcon(direction) {
    const img = document.createElement('img');
    img.style.width = '26px';
    img.style.height = '26px';
    img.style.cursor = 'pointer';
    img.style.marginLeft = '4px';
    const leftIcon = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAABmJLR0QA/wD/AP+gvaeTAAABGklEQVRoge2ZMQ6CQBBFn8bGxgNI7Rltbb2JFvbeiZgIjSUWsIYQdiMws8sm85IpDOuf/7MTNgAYhmGsmRPwAGqgWVg1cAeKmOZfAsaHVcYK8VAw7+oWI4DE2PjqLWVyE7jWTFj7D9J6AGwlRFJiAVKzm7B2OMOrIPsdyCXAZc6ftM4AV1PMzxrfuQ0l9Zz5LAP0zWcXYGg+qwBj5rMJ4DOfRYCQeW//NZ0DH2nBFCN0HlmXzQg5fCHUGmrojYVQbaihNwyh3lBDrx8iSkMNPRdilCkPNKm4AnvfRXsrkRoLkBoLkJrQbbQGDr3fEmeBo5ISCu3AU6pJZO0fBe3HiNBDxpwqgWOMAHSNbrRbvtR41WlFM28YhqHPF0NRPAWhEg4IAAAAAElFTkSuQmCC';
    const bottomIcon = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAABmJLR0QA/wD/AP+gvaeTAAAA+0lEQVRoge2XsQ6CMBCGP9RV4yyzz+hofBsc2F0dfBriAC+AAzQhBBp6plxJ7ktuIC30+3OQUjAMw9g6N6AV1l3BdxJJiGTkHSEhkpN3LAmRrLzDFyJ5ecdUiM3IO4YhosnvYz0Y+AAZ8AYeEdcxDMPDFSiBBvn/jrQa4Ank/8h/FcTHVUlDlAnIuyrmJDNPgAY4BoaORQ2cpwZ8AdqAuTFYtP5uBZGoWABtDgFzx+9kEmy+AxZAm5BvQHsfmGTzHbAA2lgAbSyANr59oAFOg2vNf6F6bsDXgVcEESkil5zuQK19Hq6AiyQA/Y0FXQvXFq/7tcXyhmEY8fkBDhLw1fWJwhgAAAAASUVORK5CYII=';
    img.src = direction === 'left' ? leftIcon : bottomIcon;
    img.title = direction === 'left' ? 'Dock vertical' : 'Dock horizontal';
    img.onclick = () => this.toggleOrientation(direction === 'bottom');
    return img;
  }

  updateWeeklySaveOptions(selected) {
    if (!this.weeklySaveSelect) return;
    const names = Object.keys(phasing_config.weeklySaves);
    this.weeklySaveSelect.innerHTML = '';
    if (!names.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Sin guardados';
      this.weeklySaveSelect.appendChild(opt);
      this.weeklySaveSelect.disabled = true;
      return;
    }
    this.weeklySaveSelect.disabled = false;
    names.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      this.weeklySaveSelect.appendChild(opt);
    });
    const value = selected && names.includes(selected) ? selected : names[0];
    this.weeklySaveSelect.value = value;
  }

  promptSaveWeekly() {
    if (!phasing_config.tasks.length) {
      alert('No hay tareas para guardar.');
      return;
    }
    const defaultLabel = this.getWeekLabel(this.simulationDate || new Date());
    const name = prompt('Nombre del guardado semanal', defaultLabel);
    if (!name) return;
    this.saveWeeklySnapshot(name, phasing_config.tasks, phasing_config.objects);
    phasing_config.activeSave = name;
    this.updateWeeklySaveOptions(name);
  }

  getWeekLabel(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const firstDay = new Date(d.getFullYear(), 0, 1);
    const pastDays = Math.floor((d - firstDay) / 86400000);
    const week = Math.ceil((pastDays + firstDay.getDay() + 1) / 7);
    return `Semana ${week} ${year}`;
  }

  saveWeeklySnapshot(name, tasks, objects = {}) {
    if (!name || !tasks || !tasks.length) return;
    phasing_config.weeklySaves[name] = {
      tasks: tasks.map(task => ({
        ...task,
        start: new Date(task.start).toISOString(),
        end: new Date(task.end).toISOString()
      })),
      objects: Object.fromEntries(Object.entries(objects).map(([key, list]) => [key, [...list]]))
    };
  }

  loadWeeklySave(name) {
    if (!name || !phasing_config.weeklySaves[name]) return;
    const snapshot = phasing_config.weeklySaves[name];
    const tasks = snapshot.tasks.map(task => ({
      ...task,
      start: new Date(task.start),
      end: new Date(task.end)
    }));
    phasing_config.tasks = tasks.map(task => ({ ...task }));
    phasing_config.objects = {};
    Object.entries(snapshot.objects || {}).forEach(([key, list]) => {
      phasing_config.objects[key] = [...list];
    });
    this.loadingScenario = true;
    this.renderGantt(phasing_config.tasks);
    this.loadingScenario = false;
    phasing_config.activeSave = name;
    this.updateWeeklySaveOptions(name);
    window.dispatchEvent(new CustomEvent('phasing-tasks', {
      detail: phasing_config.tasks.map(t => ({
        dbid: t.dbId,
        name: t.name,
        startDate: t.start,
        endDate: t.end
      }))
    }));
  }

  toggleSimulation() {
    if (!this.simSlider || this.simSlider.disabled) return;
    if (this.simulationTimer) {
      this.stopSimulation();
    } else {
      this.startSimulation();
    }
  }

  startSimulation() {
    if (this.simulationTimer || !this.simSlider || this.simSlider.disabled) return;
    this.simPlayBtn.textContent = 'Pausar';
    const interval = Math.max(1000 / (this.simulationSpeed || 1), 50);
    this.simulationTimer = setInterval(() => {
      const limits = this.getPlaybackLimits();
      const min = limits ? limits.min : Number(this.simSlider.min);
      const max = limits ? limits.max : Number(this.simSlider.max);
      let next = Number(this.simSlider.value) + this.simulationStep;
      if (next > max) {
        if (this.rangeStart && this.rangeEnd) {
          next = min;
        } else {
          this.stopSimulation();
          return;
        }
      }
      this.simSlider.value = String(next);
      this.onSimulationSliderChange();
    }, interval);
  }

  stopSimulation() {
    if (this.simulationTimer) {
      clearInterval(this.simulationTimer);
      this.simulationTimer = null;
    }
    if (this.simPlayBtn) {
      this.simPlayBtn.textContent = 'Reproducir';
    }
  }

  onSimulationSliderChange() {
    if (!this.simSlider || this.simSlider.disabled) return;
    this.simulationDate = new Date(Number(this.simSlider.value));
    this.handleColors();
    this.updateSimulationMarkerPosition();
  }

  onSimulationSpeedChange() {
    const value = Number(this.simSpeedSelect?.value || 1);
    this.simulationSpeed = Number.isNaN(value) || value <= 0 ? 1 : value;
    if (this.simulationTimer) {
      this.stopSimulation();
      this.startSimulation();
    }
  }

  applyPlaybackRange() {
    if (!this.simSlider || !this.timelineBounds) {
      if (this.simSlider) {
        this.simSlider.disabled = true;
      }
      return;
    }
    const hasRange = this.rangeStart && this.rangeEnd;
    const min = hasRange ? this.rangeStart.getTime() : this.timelineBounds.min;
    const max = hasRange ? this.rangeEnd.getTime() : this.timelineBounds.max;
    if (min === undefined || max === undefined || min === max) {
      this.simSlider.disabled = true;
      this.simulationDate = null;
      this.hideSimulationMarker();
      this.hideRangeHighlight();
      return;
    }
    this.simSlider.min = String(min);
    this.simSlider.max = String(max);
    this.simSlider.step = String(this.simulationStep);
    this.simSlider.disabled = false;
    if (!this.simSlider.value || Number(this.simSlider.value) < min || Number(this.simSlider.value) > max) {
      this.simSlider.value = String(min);
      this.simulationDate = new Date(min);
    }
    if (!hasRange) {
      this.hideRangeHighlight();
    } else {
      this.updateRangeHighlight();
    }
    this.refreshSimulationMarker();
  }

  updateSimulationRange(tasks) {
    if (!this.simSlider) return;
    this.stopSimulation();
    if (!tasks || !tasks.length) {
      this.simSlider.disabled = true;
      this.simSlider.value = 0;
      this.simulationDate = null;
      this.hideSimulationMarker();
      this.timelineBounds = null;
      return;
    }
    const timestamps = [];
    tasks.forEach(task => {
      const start = new Date(task.start).getTime();
      const end = new Date(task.end).getTime();
      if (!Number.isNaN(start)) timestamps.push(start);
      if (!Number.isNaN(end)) timestamps.push(end);
    });
    if (!timestamps.length) {
      this.simSlider.disabled = true;
      this.simulationDate = null;
      this.timelineBounds = null;
      return;
    }
    const min = Math.min(...timestamps);
    const max = Math.max(...timestamps);
    this.timelineBounds = { min, max };
    this.applyPlaybackRange();
  }

  refreshSimulationMarker() {
    if (!this.gantt) {
      this.hideSimulationMarker();
      return;
    }
    const svg = this.content.querySelector('svg');
    if (!svg) {
      this.hideSimulationMarker();
      return;
    }
    if (!this.simulationMarker) {
      this.simulationMarker = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      this.simulationMarker.setAttribute('stroke', '#2ecc71');
      this.simulationMarker.setAttribute('stroke-width', '2');
      this.simulationMarker.setAttribute('opacity', '0.9');
      this.simulationMarker.style.cursor = 'ew-resize';
      this.simulationMarker.style.pointerEvents = 'stroke';
      this.simulationMarker.addEventListener('pointerenter', () => {
        this.simulationMarker.style.strokeWidth = '4';
      });
      this.simulationMarker.addEventListener('pointerleave', () => {
        if (!this.isDraggingMarker) {
          this.simulationMarker.style.strokeWidth = '2';
        }
      });
    }
    if (!svg.contains(this.simulationMarker)) {
      svg.appendChild(this.simulationMarker);
    }
    this.updateSimulationMarkerPosition();
  }

  updateSimulationMarkerPosition() {
    if (!this.simulationMarker || !this.gantt) return;
    const svg = this.content.querySelector('svg');
    if (!svg) return;
    const reference = this.simulationDate || new Date();
    const start = this.gantt.gantt_start;
    const end = this.gantt.gantt_end;
    if (!start || !end) return;
    const totalHours = (end - start) / 36e5;
    if (totalHours <= 0) return;
    const perHour = this.gantt.options.column_width / this.gantt.options.step;
    let x = ((reference - start) / 36e5) * perHour;
    const maxX = totalHours * perHour;
    if (x < 0) x = 0;
    if (x > maxX) x = maxX;
    const height =
      (svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.height) ||
      svg.getBoundingClientRect().height ||
      (this.gantt.options.header_height +
        this.gantt.options.padding +
        (this.gantt.options.bar_height + this.gantt.options.padding) * this.gantt.tasks.length +
        this.gantt.options.padding);
    this.simulationMarker.setAttribute('x1', x);
    this.simulationMarker.setAttribute('x2', x);
    this.simulationMarker.setAttribute('y1', 0);
    this.simulationMarker.setAttribute('y2', height);
    this.simulationMarker.style.display = 'block';
  }

  hideSimulationMarker() {
    if (this.simulationMarker) {
      this.simulationMarker.style.display = 'none';
    }
  }

  updateRangeHighlight(startOverride = null, endOverride = null) {
    const startDate = startOverride || this.rangeStart;
    const endDate = endOverride || this.rangeEnd;
    if (!startDate || !endDate || !this.gantt) {
      this.hideRangeHighlight();
      return;
    }
    const svg = this.gantt?.$svg || this.content.querySelector('svg');
    if (!svg) return;
    const gridLayer = svg.querySelector('.grid') || svg;
    if (!this.rangeHighlight) {
      this.rangeHighlight = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      this.rangeHighlight.setAttribute('fill', 'rgba(46, 204, 113, 0.15)');
      this.rangeHighlight.setAttribute('stroke', '#2ecc71');
      this.rangeHighlight.setAttribute('stroke-width', '1');
      this.rangeHighlight.setAttribute('rx', '2');
      this.rangeHighlight.setAttribute('ry', '2');
      this.rangeHighlight.setAttribute('pointer-events', 'none');
    }
    if (this.rangeHighlight.parentNode !== gridLayer) {
      gridLayer.appendChild(this.rangeHighlight);
    }
    const start = Math.min(startDate.getTime(), endDate.getTime());
    const end = Math.max(startDate.getTime(), endDate.getTime());
    const startX = this.xFromDate(new Date(start));
    const endX = this.xFromDate(new Date(end));
    const width = Math.max(2, endX - startX);
    const headers = svg.querySelectorAll('.upper-text, .lower-text, .grid-header');
    let headerTop = 0;
    let headerBottom = 0;
    if (headers.length) {
      const rects = Array.from(headers).map(el =>
        typeof el.getBBox === 'function' ? el.getBBox() : el.getBoundingClientRect()
      );
      headerTop = Math.min(...rects.map(r => r.y));
      headerBottom = Math.max(...rects.map(r => r.y + r.height));
    } else {
      headerBottom = this.gantt.options.header_height + this.gantt.options.padding;
    }
    const headerHeight = headerBottom - headerTop || (this.gantt.options.header_height + this.gantt.options.padding);
    this.rangeHighlight.setAttribute('x', startX);
    this.rangeHighlight.setAttribute('y', headerTop);
    this.rangeHighlight.setAttribute('width', width);
    this.rangeHighlight.setAttribute('height', headerHeight);
    this.rangeHighlight.style.display = 'block';
  }

  hideRangeHighlight() {
    if (this.rangeHighlight) {
      this.rangeHighlight.style.display = 'none';
    }
  }

  bindMarkerInteraction() {
    const svg = this.content.querySelector('svg');
    if (!svg) return;
    let dragging = false;
    const onPointerMove = event => {
      if (!dragging) return;
      this.lastPointerPosition = { x: event.clientX, y: event.clientY };
      this.moveMarkerToPointer(event, svg);
    };
    const onPointerUp = event => {
      if (!dragging) return;
      dragging = false;
      this.isDraggingMarker = false;
      if (this.simulationMarker) {
        this.simulationMarker.style.strokeWidth = '2';
      }
      const finalEvent = event || (this.lastPointerPosition ? { clientX: this.lastPointerPosition.x } : null);
      this.finishRangeSelection(finalEvent, svg);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
    svg.addEventListener('pointerdown', event => {
      if (!this.gantt || !this.simSlider || this.simSlider.disabled) return;
      dragging = true;
      this.isDraggingMarker = true;
      if (this.simulationMarker) {
        this.simulationMarker.style.strokeWidth = '4';
      }
      this.rangeSelectionStart = this.dateFromX(event.clientX - svg.getBoundingClientRect().left);
      if (!this.rangeSelectionStart) {
        dragging = false;
        this.isDraggingMarker = false;
        return;
      }
      this.lastPointerPosition = { x: event.clientX, y: event.clientY };
      this.moveMarkerToPointer(event, svg);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    });
  }

  moveMarkerToPointer(event, svg) {
    const svgRect = svg.getBoundingClientRect();
    const x = event.clientX - svgRect.left;
    const position = this.dateFromX(x);
    if (!position) return;
    this.simulationDate = position;
    this.simSlider.value = String(position.getTime());
    this.handleColors();
    this.updateSimulationMarkerPosition();
    if (this.rangeSelectionStart) {
      this.updateRangeHighlight(this.rangeSelectionStart, this.simulationDate);
    }
  }

  finishRangeSelection(event, svg) {
    const start = this.rangeSelectionStart;
    this.rangeSelectionStart = null;
    if (!start) {
      this.hideRangeHighlight();
      return;
    }
    const endDate = this.getPointerDate(event, svg);
    if (!endDate) {
      this.hideRangeHighlight();
      return;
    }
    if (Math.abs(endDate.getTime() - start.getTime()) < this.simulationStep) {
      this.hideRangeHighlight();
      return;
    }
    this.setPlaybackRange(start, endDate);
  }

  getPointerDate(event, svg) {
    if (!svg) return null;
    const refEvent = event || (this.lastPointerPosition ? { clientX: this.lastPointerPosition.x } : null);
    if (!refEvent) return null;
    const svgRect = svg.getBoundingClientRect();
    const x = refEvent.clientX - svgRect.left;
    return this.dateFromX(x);
  }

  dateFromX(x) {
    if (!this.gantt) return null;
    const start = this.gantt.gantt_start;
    const end = this.gantt.gantt_end;
    if (!start || !end) return null;
    const perHour = this.gantt.options.column_width / this.gantt.options.step;
    const hours = x / perHour;
    const date = new Date(start.getTime() + hours * 36e5);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  }

  xFromDate(date) {
    if (!this.gantt || !date) return 0;
    const start = this.gantt.gantt_start;
    if (!start) return 0;
    const perHour = this.gantt.options.column_width / this.gantt.options.step;
    const diffHours = (date - start) / 36e5;
    return diffHours * perHour;
  }

  clearPlaybackRange() {
    this.rangeStart = null;
    this.rangeEnd = null;
    this.rangeSelectionStart = null;
    this.hideRangeHighlight();
    this.applyPlaybackRange();
  }

  setPlaybackRange(start, end) {
    if (!start || !end) return;
    const startDate = start instanceof Date ? start : new Date(start);
    const endDate = end instanceof Date ? end : new Date(end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return;
    if (Math.abs(endDate - startDate) < this.simulationStep) {
      return;
    }
    if (startDate > endDate) {
      this.rangeStart = endDate;
      this.rangeEnd = startDate;
    } else {
      this.rangeStart = startDate;
      this.rangeEnd = endDate;
    }
    this.applyPlaybackRange();
    this.updateRangeHighlight();
  }

  getPlaybackLimits() {
    if (this.rangeStart && this.rangeEnd) {
      return {
        min: this.rangeStart.getTime(),
        max: this.rangeEnd.getTime()
      };
    }
    if (this.timelineBounds) {
      return { ...this.timelineBounds };
    }
    return null;
  }

  async openMappingDialog() {
    await this.extension.configureMappings();
  }

  async refresh() {
    this.showMessage('Generando Gantt...');
    const result = await this.extension.fetchTasksForPanel();
    if (!result.success) {
      this.gantt = null;
      document.getElementById('phasing-container').innerHTML = '<svg id="phasing-container"></svg>';
      this.showMessage(result.message);
      this.hideSimulationMarker();
      return;
    }
    this.showMessage('');
    this.renderGantt(result.tasks);
    this.handleColors();
  }

  renderGantt(tasks) {
    const ganttTasks = tasks.map(task => ({
      id: task.id,
      name: task.name,
      start: task.start,
      end: task.end,
      progress: task.progress ?? 0,
      dependencies: task.dependencies || ''
    }));

    this.stopSimulation();
    this.content.innerHTML = '<svg id="phasing-container"></svg>';
    this.gantt = new Gantt('#phasing-container', ganttTasks, {
      view_mode: this.currentViewMode,
      on_click: task => this.onBarClick(task),
      on_progress_change: (task, progress) => {
        task.progress = Math.round(progress);
        this.handleColors();
      },
      on_date_change: (task, start, end) => {
        task.start = start;
        task.end = end;
        this.handleColors();
      },
      custom_popup_html: null
    });
    this.gantt.change_view_mode(this.currentViewMode);
    if (!this.loadingScenario) {
      this.saveWeeklySnapshot('Semana actual', phasing_config.tasks, phasing_config.objects);
      phasing_config.activeSave = 'Semana actual';
    }
    this.updateWeeklySaveOptions(phasing_config.activeSave);
    this.updateSimulationRange(tasks);
    this.handleBarsColor(this.simulationDate || new Date());
    this.refreshSimulationMarker();
    this.bindMarkerInteraction();
  }

  onBarClick(task) {
    const related = phasing_config.objects[task.id];
    if (!related || !related.length) {
      console.warn('No se encontraron elementos relacionados.');
      return;
    }
    this.extension.viewer.isolate(related);
    this.extension.viewer.fitToView(related);
  }

  changeViewMode(mode) {
    this.currentViewMode = mode;
    if (this.gantt) {
      this.gantt.change_view_mode(mode);
      this.handleBarsColor(this.simulationDate || new Date());
      this.refreshSimulationMarker();
      if (this.rangeStart && this.rangeEnd) {
        this.updateRangeHighlight();
      }
    }
  }

  showMessage(text) {
    if (text) {
      if (!this.messageEl) {
        this.messageEl = document.createElement('div');
        this.messageEl.style.padding = '8px';
        this.messageEl.style.fontSize = '13px';
        this.messageEl.style.color = '#333';
        this.body.insertBefore(this.messageEl, this.scrollHost);
      }
      this.messageEl.textContent = text;
    } else if (this.messageEl) {
      this.body.removeChild(this.messageEl);
      this.messageEl = null;
    }
  }

  toggleOrientation(isHorizontal) {
    const rect = this.extension.viewer.impl.getCanvasBoundingClientRect();
    const panelHeight = this.options.height;
    const panelWidth = this.options.width;
    if (isHorizontal) {
      this.container.style.width = `${rect.width - 20}px`;
      this.container.style.height = `${panelHeight}px`;
      this.container.style.left = `${this.options.x}px`;
      this.container.style.top = `${rect.height - panelHeight - this.options.y}px`;
    } else {
      this.container.style.width = `${panelWidth}px`;
      this.container.style.height = `${rect.height - 20}px`;
      this.container.style.left = `${this.options.x}px`;
      this.container.style.top = `${this.options.y}px`;
    }
  }

  uninitialize() {
    this.stopSimulation();
    super.uninitialize();
  }

  exportCSV() {
    if (!phasing_config.tasks.length) {
      alert('No hay tareas para exportar.');
      return;
    }
    const header = ['Task ID', 'Name', 'Start', 'End', 'Progress', 'Dependencies'];
    const rows = phasing_config.tasks.map(task => ([
      task.id,
      `"${task.name.replace(/"/g, '""')}"`,
      formatISO(task.start),
      formatISO(task.end),
      task.progress ?? 0,
      task.dependencies || ''
    ]));
    const csv = [header.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'gantt-export.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }

  handleColors(referenceOverride = null) {
    const reference = referenceOverride || this.simulationDate || new Date();
    this.handleBarsColor(reference);
    this.handleElementsColor(reference);
  }

  handleBarsColor(reference) {
    if (!this.gantt) return;
    this.gantt.bars.forEach(bar => {
      const status = this.checkTaskStatus(bar.task, reference);
      const rgb = phasing_config.statusColors[status];
      bar.$bar.style.fill = rgb ? `rgb(${rgb})` : '#999';
    });
  }

  handleElementsColor(reference) {
    const viewer = this.extension.viewer;
    viewer.clearThemingColors();
    viewer.showAll();
    if (!this.checkbox.checked || !phasing_config.tasks.length) {
      return;
    }
    const colorsCache = {};
    const ensureColor = status => {
      if (!colorsCache[status]) {
        const rgb = phasing_config.statusColors[status];
        if (!rgb) return null;
        const [r, g, b] = rgb.split(',').map(Number);
        colorsCache[status] = new THREE.Color(r / 255, g / 255, b / 255);
      }
      return colorsCache[status];
    };
    const visibleIds = [];
    const refActive = reference instanceof Date;
    this.gantt.tasks.forEach(task => {
      const status = this.checkTaskStatus(task, reference);
      const dbIds = phasing_config.objects[task.id] || [];
      const isFuture = refActive && status === 'notYetStarted';
      if (isFuture) {
        dbIds.forEach(dbId => viewer.hide(dbId));
        return;
      }
      const color = ensureColor(status);
      dbIds.forEach(dbId => {
        if (color) {
          viewer.setThemingColor(dbId, color, null, true);
        } else {
          viewer.hide(dbId);
        }
      });
      visibleIds.push(...dbIds);
    });
    if (visibleIds.length) {
      viewer.isolate(visibleIds);
    } else {
      viewer.showAll();
    }
  }

  checkTaskStatus(task, referenceDate = new Date()) {
    const now = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
    const start = new Date(task.start);
    const end = new Date(task.end);
    const progress = Number(task.progress ?? 0);
    const started = now >= start;
    const finished = now >= end;

    if (started && finished && progress === 100) return 'finished';
    if (!started && progress > 0) return 'advanced';
    if (!started && progress === 0) return 'notYetStarted';
    if (started && !finished) {
      if (progress === 0) return 'late';
      if (progress === 100) return 'advanced';
      return 'inProgress';
    }
    if (started && finished && progress < 100) return 'late';
    return 'inProgress';
  }
}

export class PhasingExtension extends Autodesk.Viewing.Extension {
  constructor(viewer, options) {
    super(viewer, options);
    this.panel = null;
    this.button = null;
    this.mapsButton = null;
    this.googleMapsPanel = null;
    this.bridgeHandlers = null;
    this.onToolbarCreated = this.onToolbarCreated.bind(this);
    this.handleOpenGoogleMaps = this.handleOpenGoogleMaps.bind(this);
  }

  load() {
    console.log('PhasingExtension loaded.');
    if (this.viewer.toolbar) {
      this.createToolbarButton();
      this.createMapsButton();
    } else {
      this.viewer.addEventListener(Autodesk.Viewing.TOOLBAR_CREATED_EVENT, this.onToolbarCreated);
    }
    this.registerBridgeEvents();
    window.addEventListener('maps-open-google', this.handleOpenGoogleMaps);
    return true;
  }

  unload() {
    console.log('PhasingExtension unloaded.');
    this.viewer.removeEventListener(Autodesk.Viewing.TOOLBAR_CREATED_EVENT, this.onToolbarCreated);
    if (this.button) {
      const toolbar = this.viewer.toolbar.getControl('dashboard-toolbar-group');
      if (toolbar) toolbar.removeControl(this.button);
      this.button = null;
    }
    if (this.mapsButton) {
      const toolbar = this.viewer.toolbar.getControl('dashboard-toolbar-group');
      if (toolbar) toolbar.removeControl(this.mapsButton);
      this.mapsButton = null;
    }
    if (this.panel) {
      this.panel.setVisible(false);
      this.panel.uninitialize();
      this.panel = null;
    }
    if (this.googleMapsPanel) {
      this.googleMapsPanel.setVisible(false);
      this.googleMapsPanel.uninitialize();
      this.googleMapsPanel = null;
    }
    window.removeEventListener('maps-open-google', this.handleOpenGoogleMaps);
    this.unregisterBridgeEvents();
    this.viewer.clearThemingColors();
    this.viewer.showAll();
    return true;
  }

  onToolbarCreated() {
    this.viewer.removeEventListener(Autodesk.Viewing.TOOLBAR_CREATED_EVENT, this.onToolbarCreated);
    this.createToolbarButton();
    this.createMapsButton();
  }

  createToolbarButton() {
    if (this.button) return;
    const toolbar = this.viewer.toolbar.getControl('dashboard-toolbar-group') || (() => {
      const group = new Autodesk.Viewing.UI.ControlGroup('dashboard-toolbar-group');
      this.viewer.toolbar.addControl(group);
      return group;
    })();
    this.button = new Autodesk.Viewing.UI.Button('phasing-gantt-button');
    this.button.setToolTip('Gantt Phasing');
    const icon = this.button.container.querySelector('.adsk-button-icon');
    if (icon) {
      icon.style.backgroundImage = 'url(https://img.icons8.com/external-outline-black-m-oki-orlando/32/ffffff/external-gantt-charts-and-diagrams-outline-black-m-oki-orlando.png)';
      icon.style.backgroundSize = '20px';
      icon.style.backgroundRepeat = 'no-repeat';
      icon.style.backgroundPosition = 'center';
    }
    this.button.onClick = () => {
      if (!this.panel) {
        this.panel = new PhasingPanel(this, 'phasing-panel', 'Schedule');
      }
      this.panel.setVisible(!this.panel.isVisible());
      this.button.setState(this.panel.isVisible() ? Autodesk.Viewing.UI.Button.State.ACTIVE : Autodesk.Viewing.UI.Button.State.INACTIVE);
      if (this.panel.isVisible()) {
        this.panel.refresh();
      } else {
        this.viewer.clearThemingColors();
        this.viewer.showAll();
      }
    };
    toolbar.addControl(this.button);
  }

  createMapsButton() {
    if (this.mapsButton) return;
    const toolbar = this.viewer.toolbar.getControl('dashboard-toolbar-group') || (() => {
      const group = new Autodesk.Viewing.UI.ControlGroup('dashboard-toolbar-group');
      this.viewer.toolbar.addControl(group);
      return group;
    })();
    this.mapsButton = new Autodesk.Viewing.UI.Button('maps-view-button');
    this.mapsButton.setToolTip('Ver en Maps');
    const icon = this.mapsButton.container.querySelector('.adsk-button-icon');
    if (icon) {
      icon.style.backgroundImage = 'none';
      icon.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M1 6l7-3 7 3 7-3v15l-7 3-7-3-7 3V6z"/>
          <path d="M8 3v15"/>
          <path d="M15 6v15"/>
        </svg>
      `;
    }
    this.mapsButton.onClick = () => {
      if (this.googleMapsPanel) {
        const visible = this.googleMapsPanel.isVisible();
        this.googleMapsPanel.setVisible(!visible);
        this.mapsButton.setState(visible ? Autodesk.Viewing.UI.Button.State.INACTIVE : Autodesk.Viewing.UI.Button.State.ACTIVE);
      } else {
        this.openGoogleMapsPanel(null);
        this.mapsButton.setState(Autodesk.Viewing.UI.Button.State.ACTIVE);
      }
    };
    toolbar.addControl(this.mapsButton);
  }

  handleOpenGoogleMaps(event) {
    const job = event?.detail?.job;
    if (!job || job.status !== 'ready' || !job.tileset_url) {
      alert('Genera el recurso GIS antes de abrir Google Maps.');
      return;
    }
    this.openGoogleMapsPanel(job);
  }

  openGoogleMapsPanel(job) {
    const existingPanels = Array.from(document.querySelectorAll('#google-maps-panel'));
    if (existingPanels.length > 1) {
      existingPanels.slice(0, -1).forEach(node => node.parentNode?.removeChild(node));
    }
    if (this.googleMapsPanel && !document.contains(this.googleMapsPanel.container)) {
      this.googleMapsPanel = null;
    }
    if (!this.googleMapsPanel) {
      this.googleMapsPanel = new GoogleMapsPanel(this.viewer);
      this.googleMapsPanel.container.style.width = '100%';
      this.googleMapsPanel.container.style.height = '100%';
      this.googleMapsPanel.container.style.left = '0';
      this.googleMapsPanel.container.style.top = '0';
      this.googleMapsPanel.initialize();
    }
    if (job?.tileset_url) {
      this.googleMapsPanel.kmlUrl = job.tileset_url;
    }
    this.googleMapsPanel.ensureMapReady();
    this.googleMapsPanel.setVisible(true);
    if (this.mapsButton) {
      this.mapsButton.setState(Autodesk.Viewing.UI.Button.State.ACTIVE);
    }
  }

  async configureMappings() {
    const model = this.viewer.model;
    if (!model) {
      alert('Carga el modelo antes de configurar el Gantt.');
      return false;
    }
    const dbids = await this.getActiveDbIds(model);
    return this.openMappingModal(model, dbids);
  }

  async fetchTasksForPanel() {
    const model = this.viewer.model;
    if (!model) {
      return { success: false, message: 'Modelo no disponible.' };
    }
    const dbids = await this.getActiveDbIds(model);
    if (!dbids.length) {
      return { success: false, message: 'No se encontraron elementos en el modelo.' };
    }
    const hasMapping = await this.ensureMappings(model, dbids);
    if (!hasMapping) {
      return { success: false, message: 'Configura los parámetros para generar el Gantt.' };
    }
    const tasks = await this.buildTasksFromModel(model, dbids);
    if (!tasks.length) {
      return { success: false, message: 'No se encontraron datos con los parámetros seleccionados.' };
    }
    return { success: true, tasks };
  }

  async ensureMappings(model, dbids) {
    if (MAPPING_FIELDS.every(field => !field.required || phasing_config.propMappings[field.key])) {
      return true;
    }
    return this.openMappingModal(model, dbids);
  }

  async openMappingModal(model, dbids) {
    let propertyNames = await this.collectPropertyNames(model, dbids);
    if (!propertyNames.length) {
      alert('No se detectaron propiedades en el modelo.');
      return false;
    }
    const current = phasing_config.propMappings;
    if (window.Swal) {
      const optionsHtml = propertyNames.map(name => `<option value="${name}">${name}</option>`).join('');
      const formHtml = MAPPING_FIELDS.map(field => `
        <label style="display:block; margin-top:8px; text-align:left;">
          <span style="display:block; font-weight:bold; margin-bottom:4px;">${field.label}${field.required ? ' *' : ''}</span>
          <select id="phasing-map-${field.key}" style="width:100%; padding:6px;">
            <option value="">-- Select property --</option>
            ${optionsHtml}
          </select>
        </label>
      `).join('');
      const result = await Swal.fire({
        title: 'Elige las propiedades',
        html: formHtml,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Guardar',
        didOpen: () => {
          for (const field of MAPPING_FIELDS) {
            const selectEl = document.getElementById(`phasing-map-${field.key}`);
            if (selectEl) {
              selectEl.value = current[field.key] || '';
            }
          }
        },
        preConfirm: () => {
          const mapping = {};
          for (const field of MAPPING_FIELDS) {
            const value = document.getElementById(`phasing-map-${field.key}`).value;
            if (field.required && !value) {
              Swal.showValidationMessage(`${field.label} es obligatorio.`);
              return false;
            }
            mapping[field.key] = value;
          }
          return mapping;
        }
      });
      if (!result.isConfirmed || !result.value) {
        return false;
      }
      phasing_config.propMappings = result.value;
      return true;
    }
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.style.position = 'fixed';
      overlay.style.inset = '0';
      overlay.style.background = 'rgba(0,0,0,0.45)';
      overlay.style.zIndex = '10000';
      const modal = document.createElement('div');
      modal.style.width = '420px';
      modal.style.maxWidth = '90%';
      modal.style.background = '#fff';
      modal.style.borderRadius = '10px';
      modal.style.margin = '80px auto';
      modal.style.padding = '16px 20px';
      overlay.appendChild(modal);
      const title = document.createElement('h3');
      title.textContent = 'Elige las propiedades';
      title.style.color = '#222';
      modal.appendChild(title);
      const error = document.createElement('div');
      error.style.color = '#c0392b';
      error.style.minHeight = '16px';
      error.style.fontSize = '13px';
      const selects = {};
      MAPPING_FIELDS.forEach(field => {
        const wrapper = document.createElement('label');
        wrapper.style.display = 'block';
        wrapper.style.marginTop = '8px';
        wrapper.style.color = '#222';
        const span = document.createElement('span');
        span.textContent = `${field.label}${field.required ? ' *' : ''}`;
        span.style.display = 'block';
        span.style.fontWeight = '600';
        span.style.marginBottom = '4px';
        span.style.color = '#222';
        wrapper.appendChild(span);
        const select = document.createElement('select');
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = '-- Select property --';
        select.appendChild(placeholder);
        propertyNames.forEach(name => {
          const option = document.createElement('option');
          option.value = name;
          option.textContent = name;
          select.appendChild(option);
        });
        select.style.background = '#fff';
        select.style.color = '#222';
        select.value = current[field.key] || '';
        selects[field.key] = select;
        wrapper.appendChild(select);
        modal.appendChild(wrapper);
      });
      modal.appendChild(error);
      const actions = document.createElement('div');
      actions.style.display = 'flex';
      actions.style.justifyContent = 'flex-end';
      actions.style.gap = '8px';
      modal.appendChild(actions);
      const cancel = document.createElement('button');
      cancel.textContent = 'Cancelar';
      cancel.style.color = '#222';
      cancel.style.background = '#e0e0e0';
      cancel.style.border = '1px solid #bbb';
      cancel.onclick = () => closeDialog(false);
      const save = document.createElement('button');
      save.textContent = 'Guardar';
      save.style.background = '#0d6efd';
      save.style.color = '#fff';
      save.style.border = 'none';
      save.style.padding = '6px 12px';
      save.onclick = () => {
        const mapping = {};
        for (const field of MAPPING_FIELDS) {
          const value = selects[field.key].value;
          if (field.required && !value) {
            error.textContent = `${field.label} es obligatorio.`;
            return;
          }
          mapping[field.key] = value;
        }
        phasing_config.propMappings = mapping;
        closeDialog(true);
      };
      actions.appendChild(cancel);
      actions.appendChild(save);
      const closeDialog = ok => {
        document.body.removeChild(overlay);
        resolve(ok);
      };
      overlay.addEventListener('click', evt => {
        if (evt.target === overlay) closeDialog(false);
      });
      document.body.appendChild(overlay);
      selects[MAPPING_FIELDS[0].key]?.focus();
    });
  }

  async buildTasksFromModel(model, dbids) {
    const mapping = phasing_config.propMappings;
    const propFilter = Array.from(new Set(Object.values(mapping).filter(Boolean)));
    const taskMap = new Map();
    const objects = {};
    for (let i = 0; i < dbids.length; i += BULK_CHUNK_SIZE) {
      const chunk = dbids.slice(i, i + BULK_CHUNK_SIZE);
      const results = await this.getBulkProperties(model, chunk, propFilter);
      for (const row of results) {
        const props = row.properties || [];
        const start = parseDate(findPropValue(props, mapping.startDate));
        const end = parseDate(findPropValue(props, mapping.endDate));
        if (!start || !end) continue;
        const id = findPropValue(props, mapping.id) || row.dbId.toString();
        const name = findPropValue(props, mapping.name) || `Elemento ${row.dbId}`;
        const progress = parseProgress(findPropValue(props, mapping.progress));
        const dependencies = parseDependencies(findPropValue(props, mapping.dependencies));

        if (!taskMap.has(id)) {
          taskMap.set(id, {
            dbId: row.dbId,
            id,
            name,
            start,
            end,
            progress,
            dependencies
          });
        }
        if (!objects[id]) objects[id] = [];
        objects[id].push(row.dbId);
      }
    }
    const tasks = Array.from(taskMap.values());
    phasing_config.tasks = tasks;
    phasing_config.objects = objects;
    window.dispatchEvent(new CustomEvent('phasing-tasks', {
      detail: tasks.map(task => ({
        dbid: task.dbId,
        name: task.name,
        startDate: task.start,
        endDate: task.end
      }))
    }));
    return tasks;
  }

  async getActiveDbIds(model) {
    const selection = this.viewer.getSelection();
    if (selection.length) return selection;
    const isolated = this.viewer.getIsolatedNodes();
    if (isolated.length) return isolated;
    if (model.leafIds && model.leafIds.length) return model.leafIds;
    const leaves = await this.findLeafNodes(model);
    model.leafIds = leaves;
    return leaves;
  }

  findLeafNodes(model) {
    return new Promise((resolve, reject) => {
      model.getObjectTree(tree => {
        const leaves = [];
        tree.enumNodeChildren(tree.getRootId(), dbid => {
          if (tree.getChildCount(dbid) === 0) leaves.push(dbid);
        }, true);
        resolve(leaves);
      }, reject);
    });
  }

  getBulkProperties(model, dbids, propFilter = []) {
    return new Promise((resolve, reject) => {
      const options = propFilter && propFilter.length ? { propFilter } : {};
      model.getBulkProperties(dbids, options, resolve, reject);
    });
  }

  async collectPropertyNames(model, dbids) {
    if (!model || !dbids.length) return [];
    const sample = dbids.slice(0, Math.min(dbids.length, 200));
    const results = await this.getBulkProperties(model, sample);
    const propertyMap = new Map();
    for (const row of results) {
      for (const prop of row.properties || []) {
        const name = prop.displayName;
        if (!name) continue;
        const category = prop.displayCategory || prop.category || 'General';
        const group = prop.attributeName || prop.dataType || prop.attributeCategory || 'Property';
        const key = `${category}::${name}`;
        if (!propertyMap.has(key)) {
          propertyMap.set(key, {
            id: key,
            name,
            category,
            group,
            path: [category, group].filter(Boolean).join(' ▸ '),
            sampleValue: prop.displayValue,
            units: prop.units || prop.unit || null
          });
        }
      }
    }
    const metadata = Array.from(propertyMap.values()).sort((a, b) => {
      if (a.category === b.category) {
        return a.name.localeCompare(b.name);
      }
      return a.category.localeCompare(b.category);
    });
    window.dispatchEvent(new CustomEvent('phasing-properties', { detail: metadata }));
    const uniqueNames = Array.from(new Set(metadata.map(item => item.name)));
    uniqueNames.sort((a, b) => a.localeCompare(b));
    return uniqueNames;
  }

  registerBridgeEvents() {
    if (this.bridgeHandlers) return;
    this.bridgeHandlers = {
      getProperties: () => this.emitPropertyNames(),
      go: ev => this.handleExternalGo(ev?.detail)
    };
    window.addEventListener('phasing-get-properties', this.bridgeHandlers.getProperties);
    window.addEventListener('phasing-go', this.bridgeHandlers.go);
  }

  unregisterBridgeEvents() {
    if (!this.bridgeHandlers) return;
    window.removeEventListener('phasing-get-properties', this.bridgeHandlers.getProperties);
    window.removeEventListener('phasing-go', this.bridgeHandlers.go);
    this.bridgeHandlers = null;
  }

  async emitPropertyNames() {
    const model = this.viewer.model;
    if (!model) return;
    const dbids = await this.getActiveDbIds(model);
    if (!dbids.length) return;
    await this.collectPropertyNames(model, dbids);
  }

  async handleExternalGo(detail) {
    if (!detail || !detail.property) return;
    const model = this.viewer.model;
    if (!model) return;
    const dbids = await this.getActiveDbIds(model);
    const duration = Number(detail.duration) || 1;
    const results = await this.getBulkProperties(model, dbids, [detail.property, 'Name']);
    const tasks = [];
    const objects = {};
    for (const row of results) {
      const props = row.properties || [];
      const startRaw = props.find(p => p.displayName === detail.property)?.displayValue;
      const start = parseDate(startRaw);
      if (!start) continue;
      const end = new Date(start);
      end.setDate(end.getDate() + duration);
      const task = {
        dbId: row.dbId,
        id: row.dbId.toString(),
        name: props.find(p => p.displayName === 'Name')?.displayValue || `Elemento ${row.dbId}`,
        start,
        end,
        progress: 0,
        dependencies: ''
      };
      tasks.push(task);
      objects[task.id] = [row.dbId];
    }
    phasing_config.tasks = tasks;
    phasing_config.objects = objects;
    if (this.panel && this.panel.isVisible()) {
      this.panel.renderGantt(tasks);
      this.panel.handleColors();
    }
  }
}
