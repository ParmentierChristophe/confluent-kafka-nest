import { Injectable, Inject } from "@nestjs/common";
import { AvroDeserializer, SerdeType, SchemaRegistryClient } from "@confluentinc/schemaregistry";
import type { AvroDeserializerConfig } from "@confluentinc/schemaregistry/dist/serde/avro";
import { SCHEMA_REGISTRY } from "../kafka.token";

export type AvroDeserializerPair<TKey = unknown, TValue = unknown> = {
  deserializeKey: (buf: Buffer | null | undefined) => Promise<TKey | null>;
  deserializeValue: (buf: Buffer | null | undefined) => Promise<TValue | null>;
};

@Injectable()
export class AvroDeserializerFactory {
  constructor(@Inject(SCHEMA_REGISTRY) private readonly registry: SchemaRegistryClient) {}

  create<TKey = unknown, TValue = unknown>(
    topic: string,
    config?: AvroDeserializerConfig
  ): AvroDeserializerPair<TKey, TValue> {
    const keyDes = new AvroDeserializer(this.registry, SerdeType.KEY, config ?? { useLatestVersion: false });
    const valueDes = new AvroDeserializer(this.registry, SerdeType.VALUE, config ?? { useLatestVersion: false });

    const safe =
      <T>(fn: (b: Buffer) => Promise<unknown>) =>
      async (b: Buffer | null | undefined): Promise<T | null> =>
        b ? ((await fn(b)) as T) : null;

    return {
      deserializeKey: safe<TKey>((b) => keyDes.deserialize(topic, b)),
      deserializeValue: safe<TValue>((b) => valueDes.deserialize(topic, b)),
    };
  }
}
