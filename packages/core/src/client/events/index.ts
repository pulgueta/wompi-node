import { WompiRequest } from "@/lib/request";
import type { RequestClientOptions } from "@/lib/request";

export type EventsListParams = {
  readonly after?: string;
  readonly limit?: number;
  readonly type?: string;
};

export type EventItem = {
  readonly id: string;
  readonly type: string;
  readonly created_at: string;
  readonly data: unknown;
};

export type EventsListResponse = {
  readonly data: EventItem[];
  readonly meta: Record<string, unknown>;
};

export class Events extends WompiRequest {
  constructor(private readonly authorizationToken: string, options?: RequestClientOptions) {
    super(options);
  }

  async list(params: EventsListParams = {}) {
    const query = new URLSearchParams();
    if (params.after) query.set("after", params.after);
    if (params.limit) query.set("limit", String(params.limit));
    if (params.type) query.set("type", params.type);

    const endpoint = query.toString() ? `/events?${query.toString()}` : "/events";
    return this.get<EventsListResponse>(endpoint);
  }
}

