import { WompiRequest } from "@/request";
import { MerchantSchema, wompiResponse } from "@/schemas";
import type { Merchant, Result } from "@/schemas";

const MerchantResponseSchema = wompiResponse(MerchantSchema);

export class Merchants extends WompiRequest {
  constructor(
    private readonly publicKey: string,
    sandbox?: boolean
  ) {
    super({ sandbox });
  }

  /**
   * Get merchant info and the presigned acceptance token.
   * No authentication required (public key is used as a path parameter).
   */
  async getMerchant(): Promise<Result<Merchant>> {
    return this.get(`/merchants/${this.publicKey}`, MerchantResponseSchema);
  }
}
