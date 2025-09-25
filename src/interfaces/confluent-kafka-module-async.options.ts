import type { ModuleMetadata, Provider } from "@nestjs/common";
import { ConfluentKafkaModuleOptions } from ".";

export interface ConfluentKafkaModuleAsyncOptions extends Pick<ModuleMetadata, "imports"> {
  useFactory: (...args: any[]) => ConfluentKafkaModuleOptions | Promise<ConfluentKafkaModuleOptions>;
  inject?: any[];
  extraProviders?: Provider[];
}
