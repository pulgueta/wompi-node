import { WompiRequest } from "@/lib/request";
import type { RequestClientOptions } from "@/lib/request";
import type {
  CreateTransactionRequest,
  CreatedTransactionResponse,
  TransactionParameters,
  TransactionResponse,
} from "@/client/transactions/types";
import { WompiError } from "@/errors/wompi-error";

export class ServerTransactions extends WompiRequest {
  constructor(private readonly authorizationToken: string, options?: RequestClientOptions) {
    super(options);
  }

  async getTransaction(id: string) {
    const transaction = await this.get<TransactionResponse>(`/transactions/${id}`, {
      Authorization: this.authorizationToken,
    });

    if (!transaction) {
      throw new WompiError(`Transaction with id ${id} not found`);
    }

    return transaction;
  }

  async getTransactions(params: TransactionParameters) {
    const queryParams = new URLSearchParams();
    if (params.id) queryParams.set("id", params.id);
    if (params.reference) queryParams.set("reference", params.reference);
    if (params.from_date) queryParams.set("from_date", params.from_date);
    if (params.until_date) queryParams.set("until_date", params.until_date);
    if (params.page) queryParams.set("page", String(params.page));
    if (params.page_size) queryParams.set("page_size", String(params.page_size));
    if (params.payment_method_type) queryParams.set("payment_method_type", params.payment_method_type);
    if (params.status) queryParams.set("status", params.status);
    if (params.customer_email) queryParams.set("customer_email", params.customer_email);
    if (params.order_by) queryParams.set("order_by", params.order_by);
    if (params.order) queryParams.set("order", params.order);

    const endpoint = `/transactions?${queryParams.toString()}`;

    const transactions = await this.get<TransactionResponse[]>(endpoint, {
      Authorization: this.authorizationToken,
    });

    return transactions ?? [];
  }

  async createTransaction(payload: CreateTransactionRequest) {
    const created = await this.post<CreatedTransactionResponse>(
      "/transactions",
      {
        Authorization: this.authorizationToken,
      },
      payload
    );

    if (!created) {
      throw new WompiError("Transaction creation failed");
    }

    return created;
  }
}

