import type { ClientConfig as RegistryClientConfig } from "@confluentinc/schemaregistry";

export type ConfluentKafkaModuleOptions = {
  kafka: KafkaAuthConfig;
  registry: SchemaRegistryOptions;
};

export type KafkaAuthConfig =
  | {
      authEnabled: false;
      clientId: string;
      bootstrapServers: string;
      sasl?: never;
      securityProtocol?: never;
    }
  | {
      authEnabled: true;
      clientId: string;
      bootstrapServers: string;
      sasl: {
        mechanism: string;
        username: string;
        password: string;
      };
      securityProtocol: "plaintext" | "ssl" | "sasl_plaintext" | "sasl_ssl";
    };

export interface SchemaRegistryOptions {
  baseUrl: string;
  basicAuth?: { username: string; password: string };
  extra?: Partial<RegistryClientConfig>;
}
