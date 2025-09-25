import { Injectable, OnModuleDestroy, Inject, LoggerService } from "@nestjs/common";
import type { KafkaJS as Confluent } from "@confluentinc/kafka-javascript";
import type { Message } from "@confluentinc/kafka-javascript/types/kafkajs";
import { KAFKA, AVRO_SERIALIZER, KAFKA_LOGGER } from "../kafka.token";
import { ProducerConfig, ProducerEntry } from "../interfaces";
import { AvroSerializerFactory } from "../factories/avro-serializer.factory";

@Injectable()
export class KafkaProducerService implements OnModuleDestroy {
  private readonly DEFAULT_COMPRESSION_CODEC = "snappy";
  private readonly DEFAULT_ACKS = -1;
  private readonly DEFAULT_MAX_BATCH_SIZE = 64_000;
  private readonly DEFAULT_LINGER_MS = 200;
  private readonly DEFAULT_REQUEST_TIMEOUT = 10_000;
  private readonly DEFAULT_MAX_IN_FLIGHT_REQUESTS_PER_CONNECTION = 5;
  private readonly DEFAULT_LOG_LEVEL = 3;
  private readonly DEFAULT_FLUSH_TIMEOUT = 5_000;
  private readonly DEFAULT_DELIVERY_TIMEOUT = 120_000;

  private connected = false;
  private producer!: Confluent.Producer;
  private connecting?: Promise<void>;

  constructor(
    @Inject(KAFKA) private readonly kafka: Confluent.Kafka,
    @Inject(AVRO_SERIALIZER)
    private readonly serializerFactory: AvroSerializerFactory,
    @Inject(KAFKA_LOGGER) private readonly logger: LoggerService
  ) {}

  private buildProducerConf(options?: ProducerConfig): Confluent.ProducerConfig {
    const conf: Confluent.ProducerConstructorConfig = {
      "batch.size": options?.batchSize ?? this.DEFAULT_MAX_BATCH_SIZE,
      "compression.codec": options?.compressionCodec ?? this.DEFAULT_COMPRESSION_CODEC,
      "linger.ms": options?.lingerMs ?? this.DEFAULT_LINGER_MS,
      "enable.idempotence": options?.enableIdempotence ?? true,
      "max.in.flight.requests.per.connection":
        options?.maxInFlightRequestsPerConnection ?? this.DEFAULT_MAX_IN_FLIGHT_REQUESTS_PER_CONNECTION,
      log_level: options?.logLevel ?? this.DEFAULT_LOG_LEVEL,
      acks: options?.acks ?? this.DEFAULT_ACKS,
      "request.timeout.ms": options?.requestTimeoutMs ?? this.DEFAULT_REQUEST_TIMEOUT,
      "delivery.timeout.ms": options?.deliveryTimeoutMs ?? this.DEFAULT_DELIVERY_TIMEOUT,
    };
    return conf;
  }

  private async ensureConnected(): Promise<void> {
    if (this.connected) return;
    if (this.connecting) {
      await this.connecting;
      return;
    }

    if (!this.producer) {
      const conf = this.buildProducerConf();
      this.producer = this.kafka.producer(conf);
    }

    this.connecting = this.producer
      .connect()
      .then(() => {
        this.connected = true;
      })
      .finally(() => {
        this.connecting = undefined;
      });

    await this.connecting;
  }

  async send<K = unknown, V = unknown>(topic: string, entries: Array<ProducerEntry<K, V>>): Promise<void> {
    this.logger?.debug?.("producer.send:start" + topic, { entriesCount: entries.length });
    await this.ensureConnected();

    const needsSerializer = entries.some(
      (entry) =>
        (entry.key != null && !Buffer.isBuffer(entry.key)) || (entry.value != null && !Buffer.isBuffer(entry.value))
    );
    const serializer = needsSerializer ? this.serializerFactory.create<K, V>(topic) : null;

    const toBuf = async (v: unknown, kind: "key" | "value"): Promise<Buffer | null> => {
      if (v == null) return null;
      if (Buffer.isBuffer(v)) return v;
      if (!serializer) throw new Error("Serializer not available");
      return kind === "key" ? await serializer.serializeKey(v as K) : await serializer.serializeValue(v as V);
    };

    const messages: Message[] = [];
    for (const entry of entries) {
      const keyBuf = await toBuf(entry.key, "key");
      const valBuf = await toBuf(entry.value, "value");

      messages.push({
        ...entry,
        key: keyBuf ?? undefined,
        value: valBuf ?? null,
      });
    }

    try {
      await this.producer.send({ topic, messages });
      this.logger?.debug?.("producer.send:done", { topic, messagesCount: messages.length });
    } catch (e: any) {
      this.logger.error(`producer failed on topic=${topic}`, e);
      throw e;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected && !this.connecting) return;
    try {
      await this.producer.flush({ timeout: this.DEFAULT_FLUSH_TIMEOUT });
    } catch (e) {
      this.logger.warn(`flush failed before disconnect: ${String(e)}`);
    }
    await this.producer.disconnect();
    this.connected = false;
  }

  async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }
}
