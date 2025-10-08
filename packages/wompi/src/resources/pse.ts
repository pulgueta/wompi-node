import type { HttpClient } from "@/internal/http-client";
import type { FinantialInstitutions } from "@/resources/pse.types";
import { WompiError } from "@/internal/wompi-error";

export class PSE {
  constructor(
    private readonly http: HttpClient,
  ) {}

  async getFinantialInstitutions() {
    const request = await this.http.get<FinantialInstitutions>(
      "/pse/financial_institutions",
    );

    if (!request) {
      throw new WompiError("Financial institutions not found");
    }

    return request;
  }
}
