# Confluent Kafka for NestJS

> **Official Confluent Client + Schema Registry**

---

## 🚀 Key Features

- **Nest Module** `KafkaModule` with `forRoot` **and** `forRootAsync` (secrets from Vault/ConfigService)
- **Simple Producer**: single API `send(topic, entries)`
  → automatic Avro serialization if you pass objects (otherwise raw buffers)
- **Ergonomic Consumer**:

  - `subscribeToMessages` (message by message)
  - `subscribeToBatch` (optimized batch)
  - Configurable **commit** strategy: `per-message` or `per-batch`
  - Optional **validators** (type guards) + **hook** `onDecodeError`

- **Avro**: symmetric factories

  - `AvroSerializerFactory` → `{ serializeKey, serializeValue }`
  - `AvroDeserializerFactory` → `{ deserializeKey, deserializeValue }`

- **Customizable Logger** via `KAFKA_LOGGER` token (inject your `LoggerService`)

---

## 📦 Installation

```bash
npm i @confluentinc/kafka-javascript @confluentinc/schemaregistry
```

> Peer deps: `@nestjs/common`, `@nestjs/core` (versions compatible with your NestJS app).

---

## 🧩 Architecture & Principles

- **API**: Short, explicit API
- **Production-ready**: heartbeats sent on consumer side, isolated decode errors

```
src/
├─ factories/
│  ├─ kafka.factory.ts                 # Confluent Kafka client
│  ├─ registry.factory.ts              # Schema Registry client
│  ├─ avro-serializer.factory.ts       # create(topic) → serializeKey/Value
│  └─ avro-deserializer.factory.ts     # create(topic,cfg) → deserializeKey/Value
├─ services/
│  ├─ producer.service.ts              # KafkaProducerService
│  └─ consumer.service.ts              # KafkaConsumerService
├─ kafka.module.ts
├─ kafka.token.ts
└─ interfaces/                         # public options, types
```

---

## ⚙️ Module Configuration

### `forRoot` (synchronous)

```ts
import { Module } from "@nestjs/common";
import { KafkaModule } from "your-lib/kafka.module";

@Module({
  imports: [
    KafkaModule.forRoot({
      kafka: {
        authEnabled: true,
        clientId: "customer-svc",
        bootstrapServers: "broker1:9092,broker2:9092",
        sasl: { mechanism: "PLAIN", username: "user", password: "pass" },
        securityProtocol: "sasl_ssl",
      },
      registry: {
        baseUrl: "https://schema-registry:8081",
        basicAuth: { username: "sr-user", password: "sr-pass" },
        extra: { requestTimeout: 10_000 },
      },
    }),
  ],
})
export class AppModule {}
```

### `forRootAsync` (asynchronous: Vault/ConfigService)

```ts
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { KafkaModule } from "your-lib/kafka.module";
import { KAFKA_LOGGER } from "your-lib/kafka.token";

@Module({
  imports: [
    ConfigModule.forRoot(),
    KafkaModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (cfg: ConfigService) => ({
        kafka: {
          authEnabled: cfg.get("KAFKA_AUTH") === "true",
          clientId: "customer-svc",
          bootstrapServers: cfg.get<string>("KAFKA_BROKERS")!,
          ...(cfg.get("KAFKA_AUTH") === "true"
            ? {
                sasl: {
                  mechanism: "PLAIN",
                  username: cfg.get<string>("KAFKA_USER")!,
                  password: cfg.get<string>("KAFKA_PASS")!,
                },
                securityProtocol: "sasl_ssl",
              }
            : {}),
        },
        registry: {
          baseUrl: cfg.get<string>("SR_URL")!,
          basicAuth: { username: cfg.get("SR_USER")!, password: cfg.get("SR_PASS")! },
          extra: { requestTimeout: 10_000 },
        },
      }),
      // (optional) custom logger for the lib
      extraProviders: [{ provide: KAFKA_LOGGER, useExisting: MyPrettyLogger }],
    }),
  ],
})
export class AppModule {}
```

> The module exports tokens: `KAFKA`, `SCHEMA_REGISTRY`, `AVRO_SERIALIZER`, `AVRO_DESERIALIZER`, `KAFKA_LOGGER`, as well as `KafkaProducerService` and `KafkaConsumerService`.

---

## ✉️ Producer — Sending Messages

**Single** API: `send(topic, entries)`

- **Objects** → automatic Avro serialization via `AvroSerializerFactory`
- **Buffers** → raw sending

```ts
import { KafkaProducerService } from 'your-lib/services/producer.service';

type Key = { id: string };
type Value = { id: string; kind: string };

constructor(private readonly producer: KafkaProducerService) {}

// Avro (auto):
await this.producer.send<Key, Value>('orders', [
  { key: { id: '42' }, value: { id: '42', kind: 'created' }, headers: { source: 'api' } },
]);

// Raw:
await this.producer.send('metrics', [
  { key: Buffer.from('k'), value: Buffer.from(JSON.stringify({ ok: true })) },
]);
```

**By default**: `enable.idempotence=true`, `acks=all`, `compression=snappy`, `linger.ms≈200`.

---

## 📥 Consumer — Consuming Messages

### 1) Message by message

```ts
import { KafkaConsumerService } from "your-lib/services/consumer.service";

type Key = { id: string };
type Value = { id: string; message: string };

const isKey = (u: unknown): u is Key => !!u && typeof u === "object" && typeof (u as any).id === "string";
const isValue = (u: unknown): u is Value =>
  !!u && typeof u === "object" && typeof (u as any).id === "string" && typeof (u as any).message === "string";

await consumer.subscribeToMessages<Key, Value>(
  {
    topic: "test-topic",
    groupId: "customers-svc",
    fromBeginning: false,
    avro: { useLatestVersion: false },
    validators: { key: isKey, value: isValue }, // optional
    onDecodeError: (err, ctx) => console.warn("decode error", { err: String(err), ctx }),
    commitStrategy: "per-message",
  },
  async ({ key, value, headers, timestamp, partition }) => {
    if (!key || !value) return;
    // business logic...
  }
);
```

### 2) Batch (performance)

```ts
await consumer.subscribeToBatch<Key, Value>(
  {
    topic: "analytics",
    groupId: "analytics-svc",
    commitStrategy: "per-batch",
  },
  async (messages) => {
    // messages: DeserializedMessage[] already Avro-decoded
    // batch processing...
  }
);
```

**Details**: heartbeats during loop, commit after processing (`per-message`) or at end of batch (`per-batch`).

---

## 🧬 Avro (serialize / deserialize)

- **Serializer**: `AvroSerializerFactory.create(topic)` → `{ serializeKey, serializeValue }`
- **Deserializer**: `AvroDeserializerFactory.create(topic, cfg?)` → `{ deserializeKey, deserializeValue }`
- **Expected subjects**: `topic-key` / `topic-value`
- **Producer** default: `useLatestVersion=true`, `autoRegisterSchemas=false`
- **Consumer** recommended: `useLatestVersion=false` (read by embedded `schemaId`)

```ts
// Direct deserialization (rarely needed on app side)
const pair = avroDeserializerFactory.create<Key, Value>("topic");
const k = await pair.deserializeKey(msg.key);
const v = await pair.deserializeValue(msg.value);
```

---

## 🧪 Error Handling & DLQ

- `onDecodeError(err, ctx)`: application hook. It's up to you to decide: **log**, **metrics**, **DLQ**, **alerting**, etc.
- The lib **does not impose** DLQ; provide, if needed, a producer pointing to `*.DLQ` in your app.

Minimal example:

```ts
onDecodeError: async (err, ctx) => {
  logger.warn("decode failed", { err: String(err), ...ctx });
  // optional: await dlqProducer.send('orders.DLQ', [{ key: ctx.offset, value: rawPayload }])
};
```

---

## 🧯 Custom Logging

Exposes a `KAFKA_LOGGER` token. Provide your `LoggerService`:

```ts
import { KAFKA_LOGGER } from "your-lib/kafka.token";

providers: [{ provide: KAFKA_LOGGER, useExisting: MyPrettyLogger }];
```

Services use this logger if provided (silent fallback otherwise).

---

## 🔍 Health Check // WIP

WORK IN PROGRESS

---

## 🧾 Public Types

```ts
export type ProducerConfig = { lingerMs?: number; logLevel?: number };

export interface SubscribeOptions<TKey = unknown, TValue = unknown> {
  topic: string;
  groupId: string;
  fromBeginning?: boolean;
  avro?: AvroDeserializerConfig;
  fetchMinBytes?: number;
  fetchWaitMaxMs?: number;
  logLevel?: number;
  validators?: { key?: (u: unknown) => u is TKey; value?: (u: unknown) => u is TValue };
  onDecodeError?: (
    err: unknown,
    ctx: { topic: string; partition: number; offset: string; kind: "key" | "value" }
  ) => void | Promise<void>;
  commitStrategy?: "per-message" | "per-batch";
}

export interface DeserializedMessage<TKey = unknown, TValue = unknown> {
  key: TKey | null;
  value: TValue | null;
  headers?: Record<string, unknown>;
  timestamp: string;
  topic: string;
  partition: number;
}
```

---

## ✅ Performance Tips

- **Commit**:
  - `per-message` if processing is potentially long/fragile (better resilience)
  - `per-batch` for throughput (analytics, ETL), making sure to process the entire batch

---
