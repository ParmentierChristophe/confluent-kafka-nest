import { Injectable } from "@nestjs/common";
import type { RawHeaders, DecodedHeaders } from "../interfaces/header";

type HeaderDecoder = {
  decodeHeaders: (input: RawHeaders | undefined) => DecodedHeaders;
};

function toText(data: Buffer | string): string {
  return typeof data === "string" ? data : data.toString("utf8");
}

function normalize(value: Buffer | string | (Buffer | string)[] | undefined): string | string[] | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value.map(toText) : toText(value);
}

@Injectable()
export class HeaderDecoderFactory {
  create(): HeaderDecoder {
    const decodeHeaders = (input: RawHeaders | undefined): DecodedHeaders => {
      if (!input) return {};
      const decodedHeaders: DecodedHeaders = {};
      for (const [key, value] of Object.entries(input)) {
        const normalizedValue = normalize(value);
        if (normalizedValue !== undefined) decodedHeaders[key] = normalizedValue;
      }
      return decodedHeaders;
    };
    return { decodeHeaders };
  }
}

export type { HeaderDecoder };
