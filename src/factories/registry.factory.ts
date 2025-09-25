import { SchemaRegistryClient } from "@confluentinc/schemaregistry";
import type { ClientConfig } from "@confluentinc/schemaregistry";
import { SchemaRegistryOptions } from "../interfaces";

export function createSchemaRegistryClient(options: SchemaRegistryOptions): SchemaRegistryClient {
  const conf: ClientConfig = {
    baseURLs: [options.baseUrl],
    ...options.extra,
  };
  if (options.basicAuth) {
    conf.basicAuthCredentials = {
      credentialsSource: "USER_INFO",
      userInfo: `${options.basicAuth.username}:${options.basicAuth.password}`,
    };
  }
  return new SchemaRegistryClient(conf);
}
