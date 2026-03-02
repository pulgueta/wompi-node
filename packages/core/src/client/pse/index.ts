import { WompiRequest } from "@/index";
import { FinancialInstitutionSchema, wompiListResponse } from "@/schemas";
import type { FinancialInstitution, Result, WompiListResponse } from "@/types";

const FinancialInstitutionsResponseSchema = wompiListResponse(FinancialInstitutionSchema);

export class PSE extends WompiRequest {
  constructor(
    private readonly publicKey: string,
    sandbox?: boolean
  ) {
    super({ sandbox });
  }

  /**
   * Get the list of PSE financial institutions.
   * Requires public key (BearerPublicKey).
   */
  async getFinancialInstitutions(): Promise<Result<WompiListResponse<FinancialInstitution>>> {
    return this.get("/pse/financial_institutions", FinancialInstitutionsResponseSchema, {
      Authorization: `Bearer ${this.publicKey}`,
    });
  }
}
