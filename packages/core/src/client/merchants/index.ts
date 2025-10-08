import { WompiRequest } from "@/lib/request";
import type { AcceptanceTokenResponse } from "./types";
import type { RequestClientOptions } from "@/lib/request";

export class Merchants extends WompiRequest {
  constructor(readonly publicKey: string, options?: RequestClientOptions) {
    super(options);
  }

  async authenticate() {
    const query = await this.get<AcceptanceTokenResponse>(`/merchants/${this.publicKey}`);

    return query;
  }
}
