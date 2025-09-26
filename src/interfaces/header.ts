import { IHeaders } from "@confluentinc/kafka-javascript/types/kafkajs";

export type RawHeaders = IHeaders;
export type DecodedHeaderValue = string | string[] | undefined;
export type DecodedHeaders = Record<string, DecodedHeaderValue>;
