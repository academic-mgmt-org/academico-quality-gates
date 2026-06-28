import './styles.css';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  Gauge,
  KeyRound,
  RefreshCw,
  Server,
  ShieldCheck,
  XCircle,
  createIcons,
} from 'lucide';
import {
  LOGIN_LATENCY_THRESHOLD_SECONDS,
  gateDefinitions,
  loginService,
  type GateDefinition,
  type GateSeverity,
} from './quality-gates';
import { PrometheusClient } from './prometheus';

type GateStatus = 'pass' | 'fail' | 'warn' | 'unknown';

type GateResult = {
  definition: GateDefinition;
  value: number | null;
  httpStatus: number | null;
  durationSeconds: number | null;
  status: GateStatus;
};

type DashboardState = {
  gates: GateResult[];
  score: number | null;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
};

const app = document.querySelector<HTMLDivElement>('#app');
const prometheus = new PrometheusClient();
const grafanaUrl = import.meta.env.VITE_GRAFANA_URL || '/grafana/';
const prometheusUrl =
  import.meta.env.VITE_PROMETHEUS_URL ||
  `/api/prometheus/query?query=${encodeURIComponent(
    'academico_quality_gate_score{service="academico-login"}',
  )}`;

let state: DashboardState = {
  gates: gateDefinitions.map((definition) => emptyGateResult(definition)),
  score: null,
  loading: true,
  error: null,
  lastUpdated: null,
};

function emptyGateResult(definition: GateDefinition): GateResult {
  return {
    definition,
    value: null,
    httpStatus: null,
    durationSeconds: null,
    status: 'unknown',
  };
}

function gateStatus(definition: GateDefinition, value: number | null): GateStatus {
  if (value === null) {
    return 'unknown';
  }

  if (value === 1) {
    return 'pass';
  }

  return definition.severity === 'advisory' ? 'warn' : 'fail';
}

async function loadGate(definition: GateDefinition): Promise<GateResult> {
  const [value, httpStatus, durationSeconds] = await Promise.all([
    prometheus.scalar(definition.passQuery(loginService.id)),
    prometheus.scalar(definition.statusQuery(loginService.id)),
    prometheus.scalar(definition.durationQuery(loginService.id)),
  ]);

  return {
    definition,
    value,
    httpStatus,
    durationSeconds,
    status: gateStatus(definition, value),
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
    const [gates, score] = await Promise.all([
      Promise.all(gateDefinitions.map((definition) => loadGate(definition))),
      prometheus.scalar(`academico_quality_gate_score{service="${loginService.id}"}`),
    ]);

    state = {
      gates,
      score,
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

function severityLabel(severity: GateSeverity): string {
  return severity === 'required' ? 'Requerido' : 'No bloqueante';
}

function dashboardStatus(): GateStatus {
  const required = state.gates.filter((gate) => gate.definition.severity === 'required');

  if (required.some((gate) => gate.status === 'fail')) {
    return 'fail';
  }

  if (required.some((gate) => gate.status === 'unknown')) {
    return 'unknown';
  }

  if (state.gates.some((gate) => gate.status === 'warn')) {
    return 'warn';
  }

  return 'pass';
}

function requiredSummary(): { passed: number; total: number } {
  const required = state.gates.filter((gate) => gate.definition.severity === 'required');
  return {
    passed: required.filter((gate) => gate.status === 'pass').length,
    total: required.length,
  };
}

function findGate(id: GateDefinition['id']): GateResult | undefined {
  return state.gates.find((gate) => gate.definition.id === id);
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) {
    return 'N/D';
  }

  if (seconds < 1) {
    return `${Math.round(seconds * 1000)} ms`;
  }

  return `${seconds.toFixed(2)} s`;
}

function formatHttpStatus(status: number | null): string {
  if (status === null) {
    return 'N/D';
  }

  return status > 0 ? `HTTP ${Math.round(status)}` : 'Sin respuesta';
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

  return `${Math.max(6, Math.min(100, Math.round((seconds / LOGIN_LATENCY_THRESHOLD_SECONDS) * 100)))}%`;
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function render() {
  if (!app) {
    return;
  }

  const status = dashboardStatus();
  const required = requiredSummary();
  const latencyGate = findGate('latency');
  const authGuardGate = findGate('auth_guard');
  const metricsGate = findGate('metrics');
  const updated = state.lastUpdated
    ? state.lastUpdated.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : 'Pendiente';

  app.innerHTML = `
    <main class="shell">
      <header class="topbar">
        <div class="title-block">
          <span class="system-label">${loginService.id} via ${loginService.gateway.id} :${loginService.gateway.port}</span>
          <h1>Quality Gates Login via Gateway</h1>
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
          <button class="icon-button primary" type="button" id="refresh-button" title="Actualizar estado" ${
            state.loading ? 'disabled' : ''
          }>
            <i data-lucide="refresh-cw"></i>
            <span>${state.loading ? 'Actualizando' : 'Actualizar'}</span>
          </button>
        </nav>
      </header>

      <section class="summary-grid" aria-label="Resumen de login">
        ${summaryTile('Estado', statusLabel(status), iconForStatus(status), status)}
        ${summaryTile('Requeridos', `${required.passed}/${required.total}`, 'shield-check', status)}
        ${summaryTile('Score', scorePercent(state.score), 'gauge', 'neutral')}
        ${summaryTile('Health latency', formatDuration(latencyGate?.durationSeconds ?? null), 'clock-3', latencyGate?.status ?? 'unknown')}
        ${summaryTile('Gateway API key', statusLabel(authGuardGate?.status ?? 'unknown'), 'key-round', authGuardGate?.status ?? 'unknown')}
        ${summaryTile('Metrics', statusLabel(metricsGate?.status ?? 'unknown'), 'server', metricsGate?.status ?? 'unknown')}
      </section>

      ${state.error ? `<p class="connection-error">${escapeHtml(state.error)}</p>` : ''}

      <section class="overview-grid" aria-label="Contexto del servicio">
        <article class="service-panel">
          <div class="panel-heading">
            <div>
              <span class="tier">${loginService.tier}</span>
              <h2>${loginService.name}</h2>
            </div>
            <span class="status-badge ${status}">
              <i data-lucide="${iconForStatus(status)}"></i>
              ${statusLabel(status)}
            </span>
          </div>
          <p class="service-description">${loginService.description}</p>
          <div class="service-meta">
            <span>${loginService.repository}</span>
            <span>${loginService.gateway.id}${loginService.gateway.routePrefix}</span>
          </div>
          <div class="meters">
            <div class="meter-row">
              <span>Score</span>
              <strong>${scorePercent(state.score)}</strong>
              <div class="meter">
                <span style="width: ${scoreWidth(state.score)}"></span>
              </div>
            </div>
            <div class="meter-row latency">
              <span>Latency</span>
              <strong>${formatDuration(latencyGate?.durationSeconds ?? null)}</strong>
              <div class="meter">
                <span style="width: ${latencyWidth(latencyGate?.durationSeconds ?? null)}"></span>
              </div>
            </div>
          </div>
        </article>

        <article class="contract-panel">
          <div class="panel-heading compact">
            <div>
              <span class="tier">contrato</span>
              <h2>Endpoints auth</h2>
            </div>
            <i data-lucide="shield-check"></i>
          </div>
          <div class="contract-list">
            ${loginService.contracts.map(contractRow).join('')}
          </div>
        </article>
      </section>

      <section class="matrix-header">
        <div>
          <h2>Gates en vivo</h2>
          <p>Ultima lectura: ${updated}</p>
        </div>
        <span class="threshold">Latency gate <= ${Math.round(LOGIN_LATENCY_THRESHOLD_SECONDS * 1000)} ms</span>
      </section>

      <div class="gate-table-shell">
        <table class="gate-table">
          <thead>
            <tr>
              <th>Gate</th>
              <th>Estado</th>
              <th>Criterio</th>
              <th>HTTP</th>
              <th>Duracion</th>
              <th>Tipo</th>
            </tr>
          </thead>
          <tbody>
            ${state.gates.map(gateRow).join('')}
          </tbody>
        </table>
      </div>
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
      Clock3,
      Gauge,
      KeyRound,
      RefreshCw,
      Server,
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

function contractRow(contract: (typeof loginService.contracts)[number]): string {
  return `
    <div class="contract-row">
      <span class="method">${contract.method}</span>
      <code>${contract.path}</code>
      <span>${contract.purpose}</span>
    </div>
  `;
}

function gateRow(gate: GateResult): string {
  return `
    <tr class="${gate.status}">
      <td>
        <div class="gate-name">
          <i data-lucide="${iconForStatus(gate.status)}"></i>
          <strong>${gate.definition.name}</strong>
        </div>
      </td>
      <td>
        <span class="status-badge ${gate.status}">
          ${statusLabel(gate.status)}
        </span>
      </td>
      <td>${gate.definition.thresholdLabel}</td>
      <td>${formatHttpStatus(gate.httpStatus)}</td>
      <td>${formatDuration(gate.durationSeconds)}</td>
      <td>
        <span class="severity ${gate.definition.severity}">${severityLabel(gate.definition.severity)}</span>
      </td>
    </tr>
  `;
}

render();
void refresh();
window.setInterval(() => void refresh(), 30000);
