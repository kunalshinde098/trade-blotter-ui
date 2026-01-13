export interface Trade {
  tradeId: string;
  book: string;
  tradeDate: string;
  instrument: string;
  trader: string;
  counterparty: string;
  notional: number;
  pnl: number;
  mtm: number;
  currency: string;
  tradeType?: string;
  status?: string;
  settlementDate?: string;
  maturityDate?: string;
  fixedRate?: number;
  floatingRate?: number;
  delta?: number;
  gamma?: number;
  vega?: number;
  theta?: number;
  additionalFields?: { [key: string]: any };
}

export interface TradeSearchRequest {
 // startRow: number;
  book?: string;
  tradeDateFrom?: string;
  tradeDateTo?: string;
  instrument?: string;
  trader?: string;
  counterparty?: string;
  status?: string;
  pageSize: number;
  searchAfter?: any[];
  requestedFields: string[];
  sortField: string;
  sortOrder: string;
}

export interface TradeSearchResponse {
  trades: Trade[];
  totalCount: number;
  lastSearchAfter: any[];
  hasMore: boolean;
}