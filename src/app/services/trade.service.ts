import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { TradeSearchRequest, TradeSearchResponse } from '../models/trade.model';
import { ColumnMetadata } from '../models/column-metadata.model';
import { environment } from '../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class TradeService {
  private readonly apiUrl = `${environment.apiUrl}/api/trades`;

  constructor(private http: HttpClient) {}

  searchTrades(request: TradeSearchRequest): Observable<TradeSearchResponse> {
    return this.http.post<TradeSearchResponse>(`${this.apiUrl}/search`, request);
  }

  getAllColumns(): Observable<ColumnMetadata[]> {
    return this.http.get<ColumnMetadata[]>(`${this.apiUrl}/columns`);
  }

  getDefaultColumns(): Observable<ColumnMetadata[]> {
    return this.http.get<ColumnMetadata[]>(`${this.apiUrl}/columns/default`);
  }

  getColumnsByCategory(category: string): Observable<ColumnMetadata[]> {
    return this.http.get<ColumnMetadata[]>(`${this.apiUrl}/columns/category/${category}`);
  }
}