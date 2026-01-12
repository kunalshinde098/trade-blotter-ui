import { Routes } from '@angular/router';
import { TradeBlotterComponent } from './components/trade-blotter/trade-blotter.component';

export const routes: Routes = [
  { path: '', component: TradeBlotterComponent },
  { path: '**', redirectTo: '' }
];