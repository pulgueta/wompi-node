import type { HttpClient } from "@/internal/http-client";
import type { FinantialInstitutions } from "@/resources/pse.types";
import { WompiError } from "@/internal/wompi-error";

export class PSE {
  constructor(
    private readonly http: HttpClient,
    private readonly bearer?: string,
  ) {}

  async getFinantialInstitutions() {
    const request = await this.http.get<FinantialInstitutions>(
      "/pse/financial_institutions",
      {
        headers: this.bearer ? { Authorization: this.bearer } : undefined,
      },
    );

    if (!request) {
      throw new WompiError("Financial institutions not found");
    }

    return request;
  }
}
