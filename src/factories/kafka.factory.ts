import { KafkaJS as Confluent } from "@confluentinc/kafka-javascript";
import type { CommonConstructorConfig } from "@confluentinc/kafka-javascript/types/kafkajs";
import { KafkaAuthConfig } from "../interfaces";

export function createKafkaClient(
  options: KafkaAuthConfig,
  extra?: Partial<CommonConstructorConfig> & Record<string, unknown>
): Confluent.Kafka {
  const conf: CommonConstructorConfig = {
    "bootstrap.servers": options.bootstrapServers,
    "client.id": options.clientId,
    ...(extra ?? {}),
  };

  if (options.authEnabled) {
    conf["sasl.mechanism"] = options.sasl.mechanism;
    conf["sasl.username"] = options.sasl.username;
    conf["sasl.password"] = options.sasl.password;
    conf["security.protocol"] = options.securityProtocol;
  }

  return new Confluent.Kafka(conf);
}
