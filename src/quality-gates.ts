export type LoginGateId = 'health' | 'readiness' | 'liveness' | 'latency' | 'auth_guard' | 'metrics';

export type GateSeverity = 'required' | 'advisory';

export type LoginService = {
  id: 'academico-login';
  name: string;
  tier: 'auth';
  port: number;
  gateway: {
    id: 'academico-gateway';
    port: number;
    routePrefix: '/login';
  };
  repository: string;
  description: string;
  contracts: Array<{
    method: 'GET' | 'POST';
    path: string;
    purpose: string;
  }>;
};

export type GateDefinition = {
  id: LoginGateId;
  name: string;
  severity: GateSeverity;
  probeGate: string;
  thresholdLabel: string;
  passQuery: (serviceId: string) => string;
  statusQuery: (serviceId: string) => string;
  durationQuery: (serviceId: string) => string;
};

export const LOGIN_LATENCY_THRESHOLD_SECONDS = 0.75;

export const loginService: LoginService = {
  id: 'academico-login',
  name: 'Academico Login',
  tier: 'auth',
  port: 3001,
  gateway: {
    id: 'academico-gateway',
    port: 3000,
    routePrefix: '/login',
  },
  repository: 'academic-mgmt-org/academico-login',
  description: 'Autenticacion, emision de JWT, refresh, logout y validacion de tokens medidos a traves de academico-gateway.',
  contracts: [
    {
      method: 'POST',
      path: '/login/api/v1/auth/login',
      purpose: 'Credenciales a accessToken y refreshToken',
    },
    {
      method: 'POST',
      path: '/login/api/v1/auth/refresh',
      purpose: 'Renovacion de accessToken',
    },
    {
      method: 'POST',
      path: '/login/api/v1/auth/logout',
      purpose: 'Revocacion de sesion',
    },
    {
      method: 'POST',
      path: '/login/api/v1/auth/validate-token-2',
      purpose: 'Validacion de JWT para gateway',
    },
    {
      method: 'GET',
      path: '/login/api/v1/whitelist/all',
      purpose: 'Whitelist expuesta por gateway con API key interna',
    },
  ],
};

const passMetric = (gate: LoginGateId, serviceId: string) =>
  `academico_quality_gate_${gate}_pass{service="${serviceId}"}`;

const probeMetric = (metric: string, gate: string, serviceId: string) =>
  `${metric}{gate="${gate}", service="${serviceId}"}`;

export const gateDefinitions: GateDefinition[] = [
  {
    id: 'health',
    name: 'Health',
    severity: 'required',
    probeGate: 'health',
    thresholdLabel: 'GET /login/api/health -> 2xx',
    passQuery: (serviceId) => passMetric('health', serviceId),
    statusQuery: (serviceId) => probeMetric('academico_core_probe_http_status', 'health', serviceId),
    durationQuery: (serviceId) => probeMetric('academico_core_probe_duration_seconds', 'health', serviceId),
  },
  {
    id: 'readiness',
    name: 'Readiness',
    severity: 'required',
    probeGate: 'readiness',
    thresholdLabel: 'GET /login/api/ready -> 2xx',
    passQuery: (serviceId) => passMetric('readiness', serviceId),
    statusQuery: (serviceId) => probeMetric('academico_core_probe_http_status', 'readiness', serviceId),
    durationQuery: (serviceId) => probeMetric('academico_core_probe_duration_seconds', 'readiness', serviceId),
  },
  {
    id: 'liveness',
    name: 'Liveness',
    severity: 'required',
    probeGate: 'liveness',
    thresholdLabel: 'GET /login/api/live -> 2xx',
    passQuery: (serviceId) => passMetric('liveness', serviceId),
    statusQuery: (serviceId) => probeMetric('academico_core_probe_http_status', 'liveness', serviceId),
    durationQuery: (serviceId) => probeMetric('academico_core_probe_duration_seconds', 'liveness', serviceId),
  },
  {
    id: 'latency',
    name: 'Latency',
    severity: 'required',
    probeGate: 'health',
    thresholdLabel: `health <= ${Math.round(LOGIN_LATENCY_THRESHOLD_SECONDS * 1000)} ms`,
    passQuery: (serviceId) => passMetric('latency', serviceId),
    statusQuery: (serviceId) => probeMetric('academico_core_probe_http_status', 'health', serviceId),
    durationQuery: (serviceId) => probeMetric('academico_core_probe_duration_seconds', 'health', serviceId),
  },
  {
    id: 'auth_guard',
    name: 'Gateway API key',
    severity: 'required',
    probeGate: 'auth_guard',
    thresholdLabel: 'GET /login/api/v1/whitelist/all -> 2xx',
    passQuery: (serviceId) => passMetric('auth_guard', serviceId),
    statusQuery: (serviceId) => probeMetric('academico_core_probe_http_status', 'auth_guard', serviceId),
    durationQuery: (serviceId) => probeMetric('academico_core_probe_duration_seconds', 'auth_guard', serviceId),
  },
  {
    id: 'metrics',
    name: 'Metrics',
    severity: 'advisory',
    probeGate: 'metrics',
    thresholdLabel: 'GET /login/metrics -> 2xx',
    passQuery: (serviceId) => passMetric('metrics', serviceId),
    statusQuery: (serviceId) => probeMetric('academico_core_probe_http_status', 'metrics', serviceId),
    durationQuery: (serviceId) => probeMetric('academico_core_probe_duration_seconds', 'metrics', serviceId),
  },
];
