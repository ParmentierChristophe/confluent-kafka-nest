import type { KafkaJS as Confluent } from "@confluentinc/kafka-javascript";

export type KafkaConsumerClientOptions = {
  fromBeginning?: boolean;
  groupId: string;
  logLevel?: number;
  fetchMinBytes?: number;
  fetchWaitMaxMs?: number;
};

export type BatchHandler = (ctx: {
  batch: Confluent.Batch;
  resolveOffset: (offset: string) => void;
  heartbeat: () => Promise<void>;
}) => Promise<void>;
