import { AvroSerializer, SerdeType, SchemaRegistryClient } from "@confluentinc/schemaregistry";
import type { AvroSerializerConfig } from "@confluentinc/schemaregistry/dist/serde/avro";
import { Inject, Injectable } from "@nestjs/common";
import { SCHEMA_REGISTRY } from "../kafka.token";

export type AvroSerializerPair<TKey = unknown, TValue = unknown> = {
  serializeKey: (data: TKey) => Promise<Buffer>;
  serializeValue: (data: TValue) => Promise<Buffer>;
};

@Injectable()
export class AvroSerializerFactory {
  private readonly avroSerializerConfig: AvroSerializerConfig;

  constructor(
    @Inject(SCHEMA_REGISTRY) private registry: SchemaRegistryClient,
    avroConfiguration: AvroSerializerConfig
  ) {
    this.avroSerializerConfig = { ...avroConfiguration };
  }

  create<TKey = unknown, TValue = unknown>(topic: string): AvroSerializerPair<TKey, TValue> {
    const keySer = new AvroSerializer(this.registry, SerdeType.KEY, this.avroSerializerConfig);
    const valSer = new AvroSerializer(this.registry, SerdeType.VALUE, this.avroSerializerConfig);

    return {
      serializeKey: async (data: TKey): Promise<Buffer> => keySer.serialize(topic, data),
      serializeValue: async (data: TValue): Promise<Buffer> => valSer.serialize(topic, data),
    };
  }
}
