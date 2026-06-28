type PrometheusSample = {
  metric: Record<string, string>;
  value: [number, string];
};

type PrometheusInstantResponse = {
  status: 'success' | 'error';
  data?: {
    resultType: string;
    result: PrometheusSample[];
  };
  error?: string;
};

const DEFAULT_PROMETHEUS_BASE_URL = '/api/prometheus';

export class PrometheusClient {
  private readonly baseUrl: string;

  constructor(baseUrl = import.meta.env.VITE_PROMETHEUS_BASE_URL || DEFAULT_PROMETHEUS_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async scalar(query: string): Promise<number | null> {
    const url = new URL(`${this.baseUrl}/query`, window.location.origin);
    url.searchParams.set('query', query);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Prometheus respondio ${response.status}`);
    }

    const payload = (await response.json()) as PrometheusInstantResponse;
    if (payload.status !== 'success') {
      throw new Error(payload.error || 'Prometheus no pudo ejecutar la consulta');
    }

    const value = payload.data?.result?.[0]?.value?.[1];
    if (value === undefined) {
      return null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
}

