import { WompiError } from './errors';
import type { ErrorResponse } from './types';

export abstract class BaseResource {
  protected readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  protected async request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    endpoint: string,
    options: {
      headers?: Record<string, string>;
      body?: unknown;
      searchParams?: Record<string, string | number | boolean | undefined>;
    } = {}
  ): Promise<T> {
    const { headers = {}, body, searchParams } = options;

    let url = `${this.baseUrl}${endpoint}`;
    
    if (searchParams) {
      const params = new URLSearchParams();
      Object.entries(searchParams).forEach(([key, value]) => {
        if (value !== undefined) {
          params.append(key, String(value));
        }
      });
      const paramString = params.toString();
      if (paramString) {
        url += `?${paramString}`;
      }
    }

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      const data = await response.json();

      if (!response.ok) {
        const errorData = data as ErrorResponse;
        const errorMessage = errorData.error?.messages?.join(', ') || 'Unknown error occurred';
        throw new WompiError(
          errorMessage,
          response.status,
          errorData.error?.type,
          errorData.error?.reason
        );
      }

      return data as T;
    } catch (error) {
      if (error instanceof WompiError) {
        throw error;
      }
      
      throw new WompiError(
        error instanceof Error ? error.message : 'Network error occurred',
        0,
        'NETWORK_ERROR'
      );
    }
  }

  protected get<T>(endpoint: string, headers?: Record<string, string>, searchParams?: Record<string, string | number | boolean | undefined>): Promise<T> {
    return this.request<T>('GET', endpoint, { headers, searchParams });
  }

  protected post<T>(endpoint: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
    return this.request<T>('POST', endpoint, { headers, body });
  }

  protected patch<T>(endpoint: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
    return this.request<T>('PATCH', endpoint, { headers, body });
  }

  protected delete<T>(endpoint: string, headers?: Record<string, string>): Promise<T> {
    return this.request<T>('DELETE', endpoint, { headers });
  }
}
