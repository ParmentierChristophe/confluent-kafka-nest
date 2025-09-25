import { Inject, Injectable, LoggerService, OnModuleDestroy } from "@nestjs/common";
import type { KafkaJS as Confluent } from "@confluentinc/kafka-javascript";
import { AVRO_DESERIALIZER, KAFKA, KAFKA_LOGGER } from "../kafka.token";
import type { IHeaders } from "@confluentinc/kafka-javascript/types/kafkajs";
import { SubscribeOptions, MessageHandler, BatchMessageHandler, DeserializedMessage } from "../interfaces";
import { KafkaConsumerClientOptions, BatchHandler } from "../interfaces/internal/kafka-consumer-client.types";
import { AvroDeserializerFactory, AvroDeserializerPair } from "../factories/avro-deserializer.factory";

@Injectable()
export class KafkaConsumerService implements OnModuleDestroy {
  private consumer?: Confluent.Consumer;
  private readonly handlers = new Map<string, BatchHandler>();

  private readonly DEFAULT_FETCH_MIN_BYTES = 16_000;
  private readonly DEFAULT_FETCH_MAX_WAIT_MS = 1_000;
  private readonly DEFAULT_LOG_LEVEL = 3;

  constructor(
    @Inject(KAFKA) private readonly kafka: Confluent.Kafka,
    @Inject(AVRO_DESERIALIZER) private readonly deserializerFactory: AvroDeserializerFactory,
    @Inject(KAFKA_LOGGER) private readonly kafkaLogger: LoggerService
  ) {}

  private createConsumer(cfg: KafkaConsumerClientOptions): Confluent.Consumer {
    return this.kafka.consumer({
      "fetch.min.bytes": cfg.fetchMinBytes ?? this.DEFAULT_FETCH_MIN_BYTES,
      "fetch.wait.max.ms": cfg.fetchWaitMaxMs ?? this.DEFAULT_FETCH_MAX_WAIT_MS,
      log_level: cfg.logLevel ?? this.DEFAULT_LOG_LEVEL,
      "group.id": cfg.groupId,
      "auto.offset.reset": cfg.fromBeginning ? "earliest" : "latest",
    });
  }

  private async getOrInitConsumer(cfg: KafkaConsumerClientOptions): Promise<Confluent.Consumer> {
    if (this.consumer) return this.consumer;

    this.kafkaLogger.log?.("consumer.init", { groupId: cfg.groupId });
    const kafkaConsumer = this.createConsumer(cfg);
    await kafkaConsumer.connect();

    await kafkaConsumer.run({
      eachBatch: async ({ batch, resolveOffset, heartbeat }) => {
        const handle = this.handlers.get(batch.topic);
        if (handle) {
          await handle({ batch, resolveOffset, heartbeat });
        } else {
          this.kafkaLogger.warn?.("No handler for topic", { topic: batch.topic });
        }
      },
    });

    this.consumer = kafkaConsumer;
    return kafkaConsumer;
  }

  private async subscribe(topic: string, handler: BatchHandler, cfg: KafkaConsumerClientOptions): Promise<void> {
    const consumer = await this.getOrInitConsumer(cfg);

    if (!this.handlers.has(topic)) {
      await consumer.subscribe({ topic });
      this.kafkaLogger.log?.("consumer.subscribe", { topic, groupId: cfg.groupId });
    }
    this.handlers.set(topic, handler);
  }

  async subscribeToMessages<TKey = unknown, TValue = unknown>(
    config: SubscribeOptions<TKey, TValue>,
    handler: MessageHandler<TKey, TValue>
  ): Promise<void> {
    const deser = this.deserializerFactory.create<TKey, TValue>(config.topic, config.avro);

    return this.subscribe(
      config.topic,
      async ({ batch, resolveOffset, heartbeat }) => {
        for (const m of batch.messages) {
          const key = await this.deserialize<TKey>(deser, m.key, { cfg: config, batch, offset: m.offset, kind: "key" });
          const value = await this.deserialize<TValue>(deser, m.value, {
            cfg: config,
            batch,
            offset: m.offset,
            kind: "value",
          });

          await handler({
            key,
            value,
            headers: m.headers as IHeaders | undefined,
            timestamp: m.timestamp ?? "",
            topic: batch.topic,
            partition: batch.partition,
          });

          if (config.commitStrategy !== "per-batch") {
            resolveOffset(m.offset);
          }
          await heartbeat();
        }

        if (config.commitStrategy === "per-batch") {
          const last = batch.messages[batch.messages.length - 1]?.offset;
          if (last) resolveOffset(last);
        }
      },
      this.buildConsumerConfig(config)
    );
  }

  async subscribeToBatch<TKey = unknown, TValue = unknown>(
    config: SubscribeOptions<TKey, TValue>,
    handler: BatchMessageHandler<TKey, TValue>
  ): Promise<void> {
    const deser = this.deserializerFactory.create<TKey, TValue>(config.topic, config.avro);

    return this.subscribe(
      config.topic,
      async ({ batch, resolveOffset, heartbeat }) => {
        const deserializedMessages: DeserializedMessage<TKey, TValue>[] = [];

        for (const message of batch.messages) {
          const key = await this.deserialize<TKey>(deser, message.key, {
            cfg: config,
            batch,
            offset: message.offset,
            kind: "key",
          });
          const value = await this.deserialize<TValue>(deser, message.value, {
            cfg: config,
            batch,
            offset: message.offset,
            kind: "value",
          });

          deserializedMessages.push({
            key,
            value,
            headers: message.headers as IHeaders | undefined,
            timestamp: message.timestamp ?? "",
            topic: batch.topic,
            partition: batch.partition,
          });

          await heartbeat();
        }

        await handler(deserializedMessages);

        const last = batch.messages[batch.messages.length - 1]?.offset;
        if (last) resolveOffset(last);
      },
      this.buildConsumerConfig(config)
    );
  }

  private async deserialize<T>(
    deser: AvroDeserializerPair<any, any>,
    raw: string | Buffer | null | undefined,
    ctx: {
      cfg: SubscribeOptions<any, any>;
      batch: Confluent.Batch;
      offset: string;
      kind: "key" | "value";
    }
  ): Promise<T | null> {
    if (!raw) return null;

    try {
      const buf = typeof raw === "string" ? Buffer.from(raw) : raw;
      const decodedUnknown = ctx.kind === "key" ? await deser.deserializeKey(buf) : await deser.deserializeValue(buf);

      const guard = ctx.kind === "key" ? ctx.cfg.validators?.key : ctx.cfg.validators?.value;

      if (guard) {
        if (guard(decodedUnknown)) return decodedUnknown as T;
        await ctx.cfg.onDecodeError?.(new Error(`${ctx.kind} shape mismatch`), {
          topic: ctx.batch.topic,
          partition: ctx.batch.partition,
          offset: ctx.offset,
          kind: ctx.kind,
        });
        return null;
      }
      return decodedUnknown as T;
    } catch (e: any) {
      this.kafkaLogger?.warn?.("consumer.decode.error", { error: String(e), ctx });
      await ctx.cfg.onDecodeError?.(e, {
        topic: ctx.batch.topic,
        partition: ctx.batch.partition,
        offset: ctx.offset,
        kind: ctx.kind,
      });
      return null;
    }
  }

  private buildConsumerConfig(config: SubscribeOptions): KafkaConsumerClientOptions {
    return {
      groupId: config.groupId,
      fromBeginning: config.fromBeginning,
      fetchMinBytes: config.fetchMinBytes,
      fetchWaitMaxMs: config.fetchWaitMaxMs,
      logLevel: config.logLevel,
    };
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.consumer) return;
    try {
      await this.consumer.disconnect();
    } catch {
      this.kafkaLogger.warn?.("Error during consumer disconnect");
    } finally {
      this.consumer = undefined;
      this.handlers.clear();
    }
  }
}
