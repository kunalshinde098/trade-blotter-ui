import { Injectable, NgZone } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { PriceUpdate } from '../models/price-update.model';
import { environment } from '../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class PriceStreamService {
  private eventSource: EventSource | null = null;
  private priceUpdates$ = new Subject<PriceUpdate>();
  private isConnecting = false;  // ADD THIS

  constructor(private ngZone: NgZone) {}

  connect(tradeIds?: string[]): Observable<PriceUpdate> {
    if (this.isConnecting) {
      console.warn('Connection already in progress');
      return this.priceUpdates$.asObservable();
    }
    
    // Disconnect existing connection before creating new one
    if (this.eventSource) {
      console.log('Closing existing connection before reconnecting');
      this.disconnect();
    }

    this.isConnecting = true;
    
    let url = `${environment.apiUrl}/api/trades/prices/stream`;
    if (tradeIds && tradeIds.length > 0) {
      url += `?tradeIds=${tradeIds.join(',')}`;
    }
    
    this.eventSource = new EventSource(url);

    this.eventSource.onopen = () => {
      console.log('SSE connection opened for', tradeIds?.length || 'all', 'trades');
      this.isConnecting = false;
    };

    this.eventSource.onmessage = (event) => {
      this.ngZone.run(() => {
        try {
          const update: PriceUpdate = JSON.parse(event.data);
          console.log('Received price update for tradeId:', update.tradeId);
          this.priceUpdates$.next(update);
        } catch (error) {
          console.error('Error parsing SSE message:', error);
        }
      });
    };

    this.eventSource.onerror = (error) => {
      console.error('SSE error:', error);
      this.isConnecting = false;
      this.disconnect();
    };

    return this.priceUpdates$.asObservable();
}

  disconnect(): void {
    this.isConnecting = false;  // ADD THIS
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  isConnected(): boolean {
    return this.eventSource !== null;
  }
}