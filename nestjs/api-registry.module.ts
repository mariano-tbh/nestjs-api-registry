import {
  ConfigurableModuleBuilder,
  Module,
  type DynamicModule,
  type FactoryProvider,
  type ModuleMetadata,
  type Provider,
} from "@nestjs/common";
import { ApiClient, ApiClientOptions } from "../core/api-client.js";
import { ApiName, __apis } from "./api.decorator.js";

const moduleDef = new ConfigurableModuleBuilder<{
  defaults?: ApiClientOptions;
  registry: Record<ApiName, ApiClientOptions>;
}>()
  .setClassMethodName("forRoot")
  .setFactoryMethodName("create")
  .setExtras({ isGlobal: true }, (def, extras) => ({ global: extras.isGlobal, ...def }))
  .build();

const {
  ConfigurableModuleClass: ApiClientModuleBaseClass,
  MODULE_OPTIONS_TOKEN,
  ASYNC_OPTIONS_TYPE,
  OPTIONS_TYPE,
} = moduleDef;

export type ApiRegistryModuleOptions = typeof OPTIONS_TYPE;
export type ApiRegistryModuleAsyncOptions = typeof ASYNC_OPTIONS_TYPE;

@Module({})
export class ApiRegistryModule extends ApiClientModuleBaseClass {
  static forFeature(options: ApiClientOptions): DynamicModule {
    return {
      module: ApiRegistryModule,
      providers: [
        {
          provide: ApiClient,
          useValue: new ApiClient(options),
        },
      ],
      exports: [ApiClient],
    };
  }

  static forFeatureAsync(
    options: {
      imports?: ModuleMetadata["imports"];
    } & Pick<FactoryProvider<ApiClientOptions>, "useFactory" | "inject">,
  ): DynamicModule {
    const API_CLIENT_OPTIONS = "API_CLIENT_OPTIONS";
    return {
      module: ApiRegistryModule,
      imports: [...(options.imports ?? [])],
      providers: [
        {
          provide: API_CLIENT_OPTIONS,
          inject: options.inject,
          useFactory: options.useFactory,
        },
        {
          provide: ApiClient,
          inject: [API_CLIENT_OPTIONS],
          useFactory(options: ApiClientOptions) {
            return new ApiClient(options);
          },
        },
      ],
      exports: [ApiClient],
    };
  }

  static forRoot(options: ApiRegistryModuleOptions): DynamicModule {
    const mod = super.forRoot(options);
    const providers = this.configureApis();
    return {
      ...mod,
      providers: [...(mod.providers ?? []), ...providers],
      exports: [...providers],
    };
  }

  static forRootAsync(options: ApiRegistryModuleAsyncOptions): DynamicModule {
    const mod = super.forRootAsync(options);
    const providers = this.configureApis();
    return {
      ...mod,
      providers: [...(mod.providers ?? []), ...providers],
      exports: [...providers],
    };
  }

  private static configureApis() {
    const providers: Provider<ApiClient>[] = [];
    providers.push({
      provide: ApiClient,
      inject: [MODULE_OPTIONS_TOKEN],
      useFactory: (options: ApiRegistryModuleOptions) => {
        const { defaults = {} } = options;
        return new ApiClient({ ...defaults });
      },
    });
    for (const [name, config] of __apis) {
      providers.push({
        provide: config.injectionToken,
        inject: [MODULE_OPTIONS_TOKEN],
        useFactory: (options: ApiRegistryModuleOptions) => {
          const { defaults = {}, registry } = options;
          const apiOptions = registry[name] ?? {};
          return new ApiClient({ ...defaults, ...apiOptions });
        },
      });
    }
    return providers;
  }
}
