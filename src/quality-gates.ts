export type ServiceTier = 'edge' | 'auth' | 'identity' | 'academic';

export type CoreService = {
  id: string;
  name: string;
  tier: ServiceTier;
  port: number;
  repository: string;
  description: string;
};

export type GateDefinition = {
  id: 'health' | 'readiness' | 'latency' | 'metrics';
  name: string;
  thresholdLabel: string;
  query: (serviceId: string) => string;
};

export const LATENCY_THRESHOLD_SECONDS = 0.75;

export const coreServices: CoreService[] = [
  {
    id: 'academico-gateway',
    name: 'Gateway',
    tier: 'edge',
    port: 3000,
    repository: 'academic-mgmt-org/academico-gateway',
    description: 'Entrada HTTP y routing hacia los microservicios core.',
  },
  {
    id: 'academico-login',
    name: 'Login',
    tier: 'auth',
    port: 3001,
    repository: 'academic-mgmt-org/academico-login',
    description: 'Autenticacion y emision de tokens.',
  },
  {
    id: 'academico-calificaciones',
    name: 'Calificaciones',
    tier: 'academic',
    port: 3002,
    repository: 'academic-mgmt-org/academico-calificaciones',
    description: 'Gestion de calificaciones y evaluaciones.',
  },
  {
    id: 'academico-notificaciones',
    name: 'Notificaciones',
    tier: 'academic',
    port: 3003,
    repository: 'academic-mgmt-org/academico-notificaciones',
    description: 'Notificaciones academicas y mensajeria operativa.',
  },
  {
    id: 'academico-matriculas',
    name: 'Matriculas',
    tier: 'academic',
    port: 3004,
    repository: 'academic-mgmt-org/academico-matriculas',
    description: 'Matriculas e inscripciones.',
  },
  {
    id: 'academico-solicitudes',
    name: 'Solicitudes',
    tier: 'academic',
    port: 3005,
    repository: 'academic-mgmt-org/academico-solicitudes',
    description: 'Solicitudes y tramites academicos.',
  },
  {
    id: 'academico-usuarios',
    name: 'Usuarios',
    tier: 'identity',
    port: 3006,
    repository: 'academic-mgmt-org/academico-usuarios',
    description: 'Gestion de usuarios academicos.',
  },
];

export const gateDefinitions: GateDefinition[] = [
  {
    id: 'health',
    name: 'Health',
    thresholdLabel: 'HTTP 2xx',
    query: (serviceId) => `academico_quality_gate_health_pass{service="${serviceId}"}`,
  },
  {
    id: 'readiness',
    name: 'Ready',
    thresholdLabel: 'HTTP 2xx',
    query: (serviceId) => `academico_quality_gate_readiness_pass{service="${serviceId}"}`,
  },
  {
    id: 'latency',
    name: 'Latency',
    thresholdLabel: '<= 750 ms',
    query: (serviceId) => `academico_quality_gate_latency_pass{service="${serviceId}"}`,
  },
  {
    id: 'metrics',
    name: 'Metrics',
    thresholdLabel: '/metrics up',
    query: (serviceId) => `academico_quality_gate_metrics_pass{service="${serviceId}"}`,
  },
];

