import type { HttpClient } from "@/internal/http-client";
import type { AcceptanceTokenResponse } from "@/resources/merchants.types";

export class Merchants {
  constructor(private readonly http: HttpClient, private readonly publicKey: string) {}

  authenticate() {
    return this.http.get<AcceptanceTokenResponse>(`/merchants/${this.publicKey}`);
  }
}

