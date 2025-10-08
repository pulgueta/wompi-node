import { WompiRequest } from "@/lib/request";
import { WompiError } from "@/errors/wompi-error";
import type { FinantialInstitutions } from "./types";
import type { RequestClientOptions } from "@/lib/request";

export class PSE extends WompiRequest {
  constructor(private readonly authorizationToken: string, options?: RequestClientOptions) {
    super(options);
  }

  async getFinantialInstitutions() {
    const request = await this.get<FinantialInstitutions>("/pse/financial_institutions");

    if (!request) {
      throw new WompiError("Financial institutions not found");
    }

    return request;
  }
}
