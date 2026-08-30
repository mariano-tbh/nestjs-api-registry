import type { AxiosRequestConfig, CreateAxiosDefaults, InternalAxiosRequestConfig } from "axios";
import type { AxiosInstance } from "axios";
import axios from "axios";
import axiosRetry, { type IAxiosRetryConfig } from "axios-retry";

export type AuthStrategy = (request: InternalAxiosRequestConfig) => void | Promise<void>;

export type ApiClientOptions = Omit<CreateAxiosDefaults, "timeout" | "axios-retry"> & {
  authStrategy?: AuthStrategy;
  setupInstance?(instance: AxiosInstance): void;
  timeout?: number | ((config: InternalAxiosRequestConfig) => number);
  retryStrategy?: IAxiosRetryConfig;
};

export class ApiClient {
  readonly #axios: AxiosInstance;

  constructor(options: ApiClientOptions) {
    const { authStrategy, setupInstance, retryStrategy, timeout, ...rest } = options;

    if (typeof timeout === "number") {
      (rest as CreateAxiosDefaults).timeout = timeout;
      this.#axios = axios.create(rest);
    } else {
      this.#axios = axios.create(rest);
      if (typeof timeout !== "undefined") {
        this.#axios.interceptors.request.use((config) => {
          config.timeout = timeout(config);
          return config;
        });
      }
    }

    if (authStrategy) {
      this.#axios.interceptors.request.use(async (config) => {
        await authStrategy(config);
        return config;
      });
    }

    if (retryStrategy) {
      axiosRetry(axios, retryStrategy);
    }

    if (setupInstance) {
      setupInstance(this.#axios);
    }
  }

  get axios() {
    return this.#axios;
  }

  async get<T = unknown>(url: string, config?: AxiosRequestConfig) {
    const res = await this.#axios.get<T>(url, config);
    return res.data;
  }

  async post<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig) {
    const res = await this.#axios.post<T>(url, data, config);
    return res.data;
  }

  async put<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig) {
    const res = await this.#axios.put<T>(url, data, config);
    return res.data;
  }

  async patch<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig) {
    const res = await this.#axios.patch<T>(url, data, config);
    return res.data;
  }

  async delete<T = unknown>(url: string, config?: AxiosRequestConfig) {
    const res = await this.#axios.delete<T>(url, config);
    return res.data;
  }

  async head<T = unknown>(url: string, config?: AxiosRequestConfig) {
    const res = await this.#axios.head<T>(url, config);
    return res.data;
  }

  async options<T = unknown>(url: string, config?: AxiosRequestConfig) {
    const res = await this.#axios.options<T>(url, config);
    return res.data;
  }

  async send<T = unknown>(config: AxiosRequestConfig) {
    const res = await this.#axios.request<T>(config);
    return res.data;
  }
}
