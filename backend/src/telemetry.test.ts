import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Regression: @opentelemetry/sdk-logs 0.2xx changed the BatchLogRecordProcessor constructor from
// `new BatchLogRecordProcessor(exporter)` to `new BatchLogRecordProcessor({ exporter })`. Passing the
// exporter directly leaves `options.exporter` undefined, so logs would never be exported.
// It only surfaced once `tsc --noEmit` could run (see the typecheck script).

const mocks = vi.hoisted(() => {
  class FakeLogExporter {}
  return {
    FakeLogExporter,
    nodeSdkConfig: undefined as unknown,
    batchProcessorArgs: [] as unknown[],
  };
});

vi.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: class {
    constructor(config: unknown) {
      mocks.nodeSdkConfig = config;
    }
    start() {}
    shutdown() {
      return Promise.resolve();
    }
  },
}));
vi.mock('@opentelemetry/auto-instrumentations-node', () => ({
  getNodeAutoInstrumentations: () => [],
}));
vi.mock('@opentelemetry/exporter-trace-otlp-http', () => ({ OTLPTraceExporter: class {} }));
vi.mock('@opentelemetry/exporter-metrics-otlp-http', () => ({ OTLPMetricExporter: class {} }));
vi.mock('@opentelemetry/exporter-logs-otlp-http', () => ({ OTLPLogExporter: mocks.FakeLogExporter }));
vi.mock('@opentelemetry/sdk-metrics', () => ({ PeriodicExportingMetricReader: class {} }));
vi.mock('@opentelemetry/sdk-logs', () => ({
  BatchLogRecordProcessor: class {
    constructor(options: unknown) {
      mocks.batchProcessorArgs.push(options);
    }
  },
}));

describe('telemetry', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.nodeSdkConfig = undefined;
    mocks.batchProcessorArgs.length = 0;
    vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://collector.invalid:4318');
    vi.stubEnv('OTEL_SDK_DISABLED', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('hands the log exporter to BatchLogRecordProcessor as { exporter }', async () => {
    await import('./telemetry.js');

    expect(mocks.batchProcessorArgs).toHaveLength(1);
    const arg = mocks.batchProcessorArgs[0] as { exporter?: unknown };
    expect(arg.exporter).toBeInstanceOf(mocks.FakeLogExporter);
  });

  it('does nothing when no OTLP endpoint is configured', async () => {
    vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', '');
    await import('./telemetry.js');

    expect(mocks.nodeSdkConfig).toBeUndefined();
    expect(mocks.batchProcessorArgs).toHaveLength(0);
  });
});
