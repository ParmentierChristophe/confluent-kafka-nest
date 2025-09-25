export type ProducerConfig = {
  compressionCodec?: "none" | "gzip" | "snappy" | "lz4" | "zstd";
  lingerMs?: number;
  batchSize?: number;
  acks?: number;
  requestTimeoutMs?: number;
  deliveryTimeoutMs?: number;
  maxInFlightRequestsPerConnection?: number;
  enableIdempotence?: boolean;
  logLevel?: number;
};

export type ProducerHeaders = Record<string, string | Buffer | (string | Buffer)[]>;

export type ProducerEntry<TKey = unknown, TValue = unknown> = {
  key?: TKey | Buffer | null;
  value?: TValue | Buffer | null;
  headers?: ProducerHeaders;
};
