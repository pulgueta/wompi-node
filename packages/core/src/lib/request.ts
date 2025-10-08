export type WompiEnvironment = "sandbox" | "production";

export type RequestClientOptions = {
  readonly environment?: WompiEnvironment;
  readonly baseUrl?: string;
  readonly defaultHeaders?: RequestInit["headers"];
};

const BASE_URL: Record<WompiEnvironment, string> = {
  sandbox: "https://sandbox.wompi.co/v1",
  production: "https://production.wompi.co/v1",
};

export class WompiRequest {
  private readonly baseUrl: string;
  private readonly defaultHeaders: RequestInit["headers"] | undefined;

  constructor(options: RequestClientOptions = {}) {
    const environment: WompiEnvironment = options.environment ?? "sandbox";
    this.baseUrl = options.baseUrl ?? BASE_URL[environment];
    this.defaultHeaders = options.defaultHeaders;
  }

  private async request<T>(
    method: "GET" | "POST" | "PATCH",
    endpoint: string,
    requestOptions: Omit<RequestInit, "method"> = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(this.defaultHeaders as Record<string, string> | undefined),
      ...(requestOptions.headers as Record<string, string> | undefined),
    };

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      ...requestOptions,
      headers,
    });

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      // Some endpoints may return empty body on error
      data = undefined;
    }

    if (!response.ok) {
      const message =
        (typeof data === "object" && data && "error" in data
          ? // @ts-expect-error - data.error is not typed
            data.error?.reason || data.error?.message
          : undefined) ||
        response.statusText ||
        "Wompi request failed";

      const error = new Error(message) as Error & {
        status?: number;
        details?: unknown;
      };
      error.status = response.status;
      error.details = data;
      throw error;
    }

    return data as T;
  }

  protected async get<const T>(endpoint: string, headers?: RequestInit["headers"]) {
    return this.request<T>("GET", endpoint, { headers });
  }

  protected async post<const T>(
    endpoint: string,
    headers?: RequestInit["headers"],
    body?: unknown
  ) {
    return this.request<T>("POST", endpoint, {
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  protected async patch<const T>(
    endpoint: string,
    headers?: RequestInit["headers"],
    body?: unknown
  ) {
    return this.request<T>("PATCH", endpoint, {
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  }
}
