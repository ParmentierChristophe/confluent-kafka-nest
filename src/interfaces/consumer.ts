import type { AvroDeserializerConfig } from "@confluentinc/schemaregistry";
import { DecodedHeaders } from "./header";

export interface DeserializedMessage<TKey = unknown, TValue = unknown> {
  key: TKey | null;
  value: TValue | null;
  headers?: DecodedHeaders;
  timestamp: string;
  topic: string;
  partition: number;
}

export type MessageHandler<TKey = unknown, TValue = unknown> = (
  message: DeserializedMessage<TKey, TValue>
) => Promise<void> | void;

export type BatchMessageHandler<TKey = unknown, TValue = unknown> = (
  messages: DeserializedMessage<TKey, TValue>[]
) => Promise<void> | void;

export interface SubscribeOptions<TKey = unknown, TValue = unknown> {
  topic: string;
  groupId: string;
  fromBeginning?: boolean;
  avro?: AvroDeserializerConfig;
  fetchMinBytes?: number;
  fetchWaitMaxMs?: number;
  logLevel?: number;
  validators?: {
    key?: (u: unknown) => u is TKey;
    value?: (u: unknown) => u is TValue;
  };

  onDecodeError?: (
    err: unknown,
    ctx: { topic: string; partition: number; offset: string; kind: "key" | "value" }
  ) => void | Promise<void>;

  commitStrategy?: "per-message" | "per-batch";
}
