import { DynamicModule, Module, Provider } from "@nestjs/common";
import { createKafkaClient } from "./factories/kafka.factory";
import { createSchemaRegistryClient } from "./factories/registry.factory";
import { KafkaProducerService } from "./services/producer.service";
import { KafkaConsumerService } from "./services/consumer.service";
import {
  KAFKA_OPTIONS,
  KAFKA,
  SCHEMA_REGISTRY,
  AVRO_SERIALIZER,
  AVRO_DESERIALIZER,
  KAFKA_LOGGER,
  HEADER_DECODER,
} from "./kafka.token";
import { AvroSerializerFactory } from "./factories/avro-serializer.factory";
import { AvroDeserializerFactory } from "./factories/avro-deserializer.factory";
import type { SchemaRegistryClient, AvroSerializerConfig } from "@confluentinc/schemaregistry";
import type { ConfluentKafkaModuleAsyncOptions, ConfluentKafkaModuleOptions } from "./interfaces";
import { Logger, LoggerService } from "@nestjs/common";
import { HeaderDecoderFactory } from "./factories/kafka-string-deserializer.factory";

@Module({})
export class KafkaModule {
  static forRoot(options: ConfluentKafkaModuleOptions): DynamicModule {
    return this.buildModule({ options });
  }

  static forRootAsync(options: ConfluentKafkaModuleAsyncOptions): DynamicModule {
    const asyncOptionsProvider: Provider = {
      provide: KAFKA_OPTIONS,
      useFactory: options.useFactory,
      inject: options.inject ?? [],
    };
    return this.buildModule({
      asyncProvider: asyncOptionsProvider,
      imports: options.imports,
      extra: options.extraProviders,
    });
  }

  private static buildModule(params: {
    options?: ConfluentKafkaModuleOptions;
    asyncProvider?: Provider;
    imports?: any[];
    extra?: Provider[];
  }): DynamicModule {
    const optionsProvider: Provider = params.asyncProvider ?? {
      provide: KAFKA_OPTIONS,
      useValue: params.options!,
    };

    const kafkaProvider: Provider = {
      provide: KAFKA,
      inject: [KAFKA_OPTIONS],
      useFactory: (opts: ConfluentKafkaModuleOptions) => createKafkaClient(opts.kafka),
    };

    const registryProvider: Provider = {
      provide: SCHEMA_REGISTRY,
      inject: [KAFKA_OPTIONS],
      useFactory: (opts: ConfluentKafkaModuleOptions) => createSchemaRegistryClient(opts.registry),
    };

    const serializerProvider: Provider = {
      provide: AVRO_SERIALIZER,
      inject: [SCHEMA_REGISTRY],
      useFactory: (registry: SchemaRegistryClient) => {
        const config: AvroSerializerConfig = {
          useLatestVersion: true,
          autoRegisterSchemas: false,
        };
        return new AvroSerializerFactory(registry, config);
      },
    };

    const deserializerFactoryProvider: Provider = {
      provide: AVRO_DESERIALIZER,
      inject: [SCHEMA_REGISTRY],
      useFactory: (registry: SchemaRegistryClient) => new AvroDeserializerFactory(registry),
    };

    const headerDeserializerFactoryProvider: Provider = {
      provide: HEADER_DECODER,
      useFactory: () => {
        return new HeaderDecoderFactory();
      },
    };

    const defaultLoggerProvider: Provider = {
      provide: KAFKA_LOGGER,
      useFactory: (): LoggerService => new Logger("Kafka"),
    };

    const providers: Provider[] = [
      optionsProvider,
      kafkaProvider,
      registryProvider,
      serializerProvider,
      deserializerFactoryProvider,
      headerDeserializerFactoryProvider,
      defaultLoggerProvider,
      KafkaProducerService,
      KafkaConsumerService,
      ...(params.extra ?? []),
    ];

    return {
      module: KafkaModule,
      imports: params.imports ?? [],
      providers,
      exports: [
        KAFKA,
        SCHEMA_REGISTRY,
        AVRO_SERIALIZER,
        AVRO_DESERIALIZER,
        KAFKA_LOGGER,
        KafkaProducerService,
        KafkaConsumerService,
      ],
    };
  }
}
