import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';

const enabled = process.env.OTEL_SDK_DISABLED !== 'true' && !!process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

if (enabled) {
  const sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter(),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(),
      exportIntervalMillis: 30_000,
    }),
    logRecordProcessors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() })],
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();

  // Flush pending telemetry on shutdown without taking ownership of the
  // exit signal — Fastify/Prisma's own SIGTERM handler is responsible for
  // closing the server. beforeExit fires after the event loop drains, so
  // app handlers run first, then we get one chance to flush exporters.
  process.once('beforeExit', () => {
    sdk.shutdown().catch(() => {
      // Best-effort flush; swallow errors so the process can still exit cleanly.
    });
  });
}
