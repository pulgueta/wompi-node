import { BaseResource } from '../base';
import type { WompiResponse } from '../types';

export interface FinancialInstitution {
  financial_institution_code: string;
  financial_institution_name: string;
}

export class PSE extends BaseResource {
  private readonly publicKey: string;

  constructor(baseUrl: string, publicKey: string) {
    super(baseUrl);
    this.publicKey = publicKey;
  }

  /**
   * Get list of available financial institutions for PSE
   * @returns List of financial institutions
   */
  async getFinancialInstitutions(): Promise<WompiResponse<FinancialInstitution[]>> {
    return super.get<WompiResponse<FinancialInstitution[]>>(
      '/pse/financial_institutions',
      { Authorization: `Bearer ${this.publicKey}` }
    );
  }
}
