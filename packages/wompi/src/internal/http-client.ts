export type HttpClientOptions = {
  baseUrl: string;
};

export class HttpClient {
  private readonly baseUrl: string;

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl;
  }

  private async request<T>(method: "GET" | "POST" | "PATCH", endpoint: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      body: init?.body,
    });

    const data = (await response.json()) as T;
    return data;
  }

  get<T>(endpoint: string, init?: RequestInit) {
    return this.request<T>("GET", endpoint, init);
  }

  post<T>(endpoint: string, init?: RequestInit) {
    return this.request<T>("POST", endpoint, init);
  }

  patch<T>(endpoint: string, init?: RequestInit) {
    return this.request<T>("PATCH", endpoint, init);
  }
}

