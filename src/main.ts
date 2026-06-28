import './styles.css';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ExternalLink,
  Gauge,
  RefreshCw,
  ShieldCheck,
  XCircle,
  createIcons,
} from 'lucide';
import {
  LATENCY_THRESHOLD_SECONDS,
  coreServices,
  gateDefinitions,
  type CoreService,
  type GateDefinition,
} from './quality-gates';
import { PrometheusClient } from './prometheus';

type GateStatus = 'pass' | 'fail' | 'warn' | 'unknown';

type GateResult = {
  definition: GateDefinition;
  value: number | null;
  status: GateStatus;
};

type ServiceQualityState = {
  service: CoreService;
  gates: GateResult[];
  latencySeconds: number | null;
  score: number | null;
};

type DashboardState = {
  services: ServiceQualityState[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
};

const app = document.querySelector<HTMLDivElement>('#app');
const prometheus = new PrometheusClient();
const grafanaUrl = import.meta.env.VITE_GRAFANA_URL || 'http://localhost:3007';
const prometheusUrl = import.meta.env.VITE_PROMETHEUS_URL || 'http://localhost:9090';

let state: DashboardState = {
  services: coreServices.map((service) => emptyServiceState(service)),
  loading: true,
  error: null,
  lastUpdated: null,
};

function emptyServiceState(service: CoreService): ServiceQualityState {
  return {
    service,
    gates: gateDefinitions.map((definition) => ({
      definition,
      value: null,
      status: 'unknown',
    })),
    latencySeconds: null,
    score: null,
  };
}

function gateStatus(definition: GateDefinition, value: number | null): GateStatus {
  if (value === null) {
    return 'unknown';
  }

  if (definition.id === 'metrics' && value !== 1) {
    return 'warn';
  }

  return value === 1 ? 'pass' : 'fail';
}

async function loadService(service: CoreService): Promise<ServiceQualityState> {
  const gates = await Promise.all(
    gateDefinitions.map(async (definition) => {
      const value = await prometheus.scalar(definition.query(service.id));
      return {
        definition,
        value,
        status: gateStatus(definition, value),
      };
    }),
  );

  const latencySeconds = await prometheus.scalar(
    `probe_duration_seconds{job="core_http_health", service="${service.id}"}`,
  );

  const hardGates = gates.filter((gate) => gate.definition.id !== 'metrics');
  const hardGateFailures = hardGates.some((gate) => gate.status === 'fail' || gate.status === 'unknown');
  const passed = gates.filter((gate) => gate.status === 'pass').length;
  const score = hardGateFailures ? passed / gates.length : passed / gates.length;

  return {
    service,
    gates,
    latencySeconds,
    score,
  };
}

async function refresh(): Promise<void> {
  state = {
    ...state,
    loading: true,
    error: null,
  };
  render();

  try {
    const services = await Promise.all(coreServices.map((service) => loadService(service)));
    state = {
      services,
      loading: false,
      error: null,
      lastUpdated: new Date(),
    };
  } catch (error) {
    state = {
      ...state,
      loading: false,
      error: error instanceof Error ? error.message : 'No se pudo leer Prometheus',
      lastUpdated: new Date(),
    };
  }

  render();
}

function statusLabel(status: GateStatus): string {
  const labels: Record<GateStatus, string> = {
    pass: 'Pass',
    fail: 'Fail',
    warn: 'Warn',
    unknown: 'Sin dato',
  };

  return labels[status];
}

function serviceStatus(serviceState: ServiceQualityState): GateStatus {
  const blocking = serviceState.gates.filter((gate) => gate.definition.id !== 'metrics');
  if (blocking.some((gate) => gate.status === 'fail')) {
    return 'fail';
  }
  if (blocking.some((gate) => gate.status === 'unknown')) {
    return 'unknown';
  }
  if (serviceState.gates.some((gate) => gate.status === 'warn')) {
    return 'warn';
  }
  return 'pass';
}

function formatLatency(seconds: number | null): string {
  if (seconds === null) {
    return 'N/D';
  }

  return `${Math.round(seconds * 1000)} ms`;
}

function scorePercent(score: number | null): string {
  if (score === null) {
    return 'N/D';
  }

  return `${Math.round(score * 100)}%`;
}

function scoreWidth(score: number | null): string {
  if (score === null) {
    return '0%';
  }

  return `${Math.max(0, Math.min(100, Math.round(score * 100)))}%`;
}

function latencyWidth(seconds: number | null): string {
  if (seconds === null) {
    return '0%';
  }

  return `${Math.max(6, Math.min(100, Math.round((seconds / LATENCY_THRESHOLD_SECONDS) * 100)))}%`;
}

function iconForStatus(status: GateStatus): string {
  const icons: Record<GateStatus, string> = {
    pass: 'check-circle-2',
    fail: 'x-circle',
    warn: 'alert-triangle',
    unknown: 'activity',
  };

  return icons[status];
}

function dashboardSummary() {
  const total = state.services.length;
  const pass = state.services.filter((service) => serviceStatus(service) === 'pass').length;
  const warn = state.services.filter((service) => serviceStatus(service) === 'warn').length;
  const fail = state.services.filter((service) => serviceStatus(service) === 'fail').length;
  const unknown = state.services.filter((service) => serviceStatus(service) === 'unknown').length;
  const avgScoreValues = state.services
    .map((service) => service.score)
    .filter((score): score is number => score !== null);
  const avgScore =
    avgScoreValues.length === 0
      ? null
      : avgScoreValues.reduce((totalScore, score) => totalScore + score, 0) / avgScoreValues.length;

  return { total, pass, warn, fail, unknown, avgScore };
}

function render() {
  if (!app) {
    return;
  }

  const summary = dashboardSummary();
  const updated = state.lastUpdated
    ? state.lastUpdated.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : 'Pendiente';

  app.innerHTML = `
    <main class="shell">
      <header class="topbar">
        <div class="title-block">
          <span class="system-label">academic-mgmt-org</span>
          <h1>Quality Gates Core Assets</h1>
        </div>
        <nav class="actions" aria-label="Acciones de monitoreo">
          <a class="icon-button" href="${grafanaUrl}" target="_blank" rel="noreferrer" title="Abrir Grafana">
            <i data-lucide="bar-chart-3"></i>
            <span>Grafana</span>
          </a>
          <a class="icon-button" href="${prometheusUrl}" target="_blank" rel="noreferrer" title="Abrir Prometheus">
            <i data-lucide="activity"></i>
            <span>Prometheus</span>
          </a>
          <button class="icon-button primary" type="button" id="refresh-button" title="Actualizar estado">
            <i data-lucide="refresh-cw"></i>
            <span>${state.loading ? 'Actualizando' : 'Actualizar'}</span>
          </button>
        </nav>
      </header>

      <section class="summary-grid" aria-label="Resumen">
        ${summaryTile('Servicios', String(summary.total), 'shield-check', 'neutral')}
        ${summaryTile('Pass', String(summary.pass), 'check-circle-2', 'pass')}
        ${summaryTile('Warn', String(summary.warn), 'alert-triangle', 'warn')}
        ${summaryTile('Fail', String(summary.fail), 'x-circle', 'fail')}
        ${summaryTile('Sin dato', String(summary.unknown), 'activity', 'unknown')}
        ${summaryTile('Score medio', scorePercent(summary.avgScore), 'gauge', 'neutral')}
      </section>

      ${state.error ? `<p class="connection-error">${state.error}</p>` : ''}

      <section class="matrix-header">
        <div>
          <h2>Servicios core</h2>
          <p>Ultima lectura: ${updated}</p>
        </div>
        <span class="threshold">Latency gate <= ${Math.round(LATENCY_THRESHOLD_SECONDS * 1000)} ms</span>
      </section>

      <section class="service-grid" aria-label="Estado por servicio">
        ${state.services.map(serviceCard).join('')}
      </section>
    </main>
  `;

  document.querySelector('#refresh-button')?.addEventListener('click', () => {
    void refresh();
  });

  createIcons({
    icons: {
      Activity,
      AlertTriangle,
      BarChart3,
      CheckCircle2,
      ExternalLink,
      Gauge,
      RefreshCw,
      ShieldCheck,
      XCircle,
    },
  });
}

function summaryTile(label: string, value: string, icon: string, tone: GateStatus | 'neutral'): string {
  return `
    <article class="summary-tile ${tone}">
      <i data-lucide="${icon}"></i>
      <div>
        <span>${label}</span>
        <strong>${value}</strong>
      </div>
    </article>
  `;
}

function serviceCard(serviceState: ServiceQualityState): string {
  const status = serviceStatus(serviceState);
  const service = serviceState.service;
  const gatePills = serviceState.gates
    .map(
      (gate) => `
        <span class="gate-pill ${gate.status}" title="${gate.definition.thresholdLabel}">
          <i data-lucide="${iconForStatus(gate.status)}"></i>
          ${gate.definition.name}
        </span>
      `,
    )
    .join('');

  return `
    <article class="service-card ${status}">
      <div class="service-heading">
        <div>
          <span class="tier">${service.tier}</span>
          <h3>${service.name}</h3>
        </div>
        <span class="status-badge ${status}">
          <i data-lucide="${iconForStatus(status)}"></i>
          ${statusLabel(status)}
        </span>
      </div>

      <p class="service-description">${service.description}</p>

      <div class="service-meta">
        <span>${service.id}</span>
        <span>:${service.port}</span>
      </div>

      <div class="gate-list">
        ${gatePills}
      </div>

      <div class="meters">
        <div class="meter-row">
          <span>Score</span>
          <strong>${scorePercent(serviceState.score)}</strong>
          <div class="meter">
            <span style="width: ${scoreWidth(serviceState.score)}"></span>
          </div>
        </div>
        <div class="meter-row latency">
          <span>Latency</span>
          <strong>${formatLatency(serviceState.latencySeconds)}</strong>
          <div class="meter">
            <span style="width: ${latencyWidth(serviceState.latencySeconds)}"></span>
          </div>
        </div>
      </div>
    </article>
  `;
}

render();
void refresh();
window.setInterval(() => void refresh(), 30000);

