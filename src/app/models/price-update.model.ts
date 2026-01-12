export interface PriceUpdate {
  tradeId: string;
  updatedFields: { [key: string]: any };
  timestamp: number;
}