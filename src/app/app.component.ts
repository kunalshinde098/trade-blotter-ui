import { Component } from '@angular/core';
import { TradeBlotterComponent } from './components/trade-blotter/trade-blotter.component';

@Component({
  selector: 'app-root',
  template: `<app-trade-blotter></app-trade-blotter>`,
  standalone: true,
  imports: [TradeBlotterComponent]
})
export class AppComponent {}