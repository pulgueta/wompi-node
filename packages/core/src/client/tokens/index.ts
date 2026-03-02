import { WompiRequest } from "@/index";
import {
  TokenizeCardInputSchema,
  TokenizeNequiInputSchema,
  NequiTokenSchema,
  CardTokenSchema,
  wompiResponse,
} from "@/schemas";
import { WompiError } from "@/errors/wompi-error";
import type { CardToken, NequiToken, Result, WompiResponse } from "@/types";

const CardTokenResponseSchema = wompiResponse(CardTokenSchema);
const NequiTokenResponseSchema = wompiResponse(NequiTokenSchema);

export class Tokens extends WompiRequest {
  constructor(
    private readonly publicKey: string,
    sandbox?: boolean
  ) {
    super({ sandbox });
  }

  /**
   * Tokenize a credit card for use in transactions or payment sources.
   * Requires public key (BearerPublicKey).
   */
  async tokenizeCard(input: unknown): Promise<Result<WompiResponse<CardToken>>> {
    const parsed = TokenizeCardInputSchema.safeParse(input);

    if (!parsed.success) {
      return [
        new WompiError(
          `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`
        ),
        null,
      ];
    }

    return this.post("/tokens/cards", CardTokenResponseSchema, parsed.data, {
      Authorization: `Bearer ${this.publicKey}`,
    });
  }

  /**
   * Tokenize a Nequi account for use in transactions or payment sources.
   * Requires public key (BearerPublicKey).
   */
  async tokenizeNequi(input: unknown): Promise<Result<WompiResponse<NequiToken>>> {
    const parsed = TokenizeNequiInputSchema.safeParse(input);

    if (!parsed.success) {
      return [
        new WompiError(
          `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`
        ),
        null,
      ];
    }

    return this.post("/tokens/nequi", NequiTokenResponseSchema, parsed.data, {
      Authorization: `Bearer ${this.publicKey}`,
    });
  }

  /**
   * Get the status of a tokenized Nequi account.
   * Requires public key (BearerPublicKey).
   */
  async getNequiToken(tokenId: string): Promise<Result<WompiResponse<NequiToken>>> {
    return this.get(`/tokens/nequi/${tokenId}`, NequiTokenResponseSchema, {
      Authorization: `Bearer ${this.publicKey}`,
    });
  }
}
