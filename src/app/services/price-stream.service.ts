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

  constructor(private ngZone: NgZone) {}

  connect(): Observable<PriceUpdate> {
  if (this.eventSource) {
    console.warn('Already connected to price stream');
    return this.priceUpdates$.asObservable();
  }

  const url = `${environment.apiUrl}/api/trades/prices/stream`;
  console.log('Connecting to SSE:', url);  // ADD THIS
  this.eventSource = new EventSource(url);

  this.eventSource.addEventListener('price-update', (event: MessageEvent) => {
    console.log('SSE event received:', event.data);  // ADD THIS
    this.ngZone.run(() => {
      const update: PriceUpdate = JSON.parse(event.data);
      console.log('Parsed update:', update);  // ADD THIS
      this.priceUpdates$.next(update);
    });
  });

  this.eventSource.onerror = (error) => {
    console.error('SSE error:', error);
    console.error('ReadyState:', this.eventSource?.readyState);  // ADD THIS
    this.disconnect();
  };

  this.eventSource.onopen = () => {
    console.log('SSE connection opened successfully');  // ADD THIS
  };

  return this.priceUpdates$.asObservable();
}

  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
      console.log('SSE connection closed');
    }
  }

  isConnected(): boolean {
    return this.eventSource !== null;
  }
}