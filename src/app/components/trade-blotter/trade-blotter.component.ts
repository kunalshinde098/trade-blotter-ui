import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AgGridAngular } from 'ag-grid-angular';
import { 
  ColDef, 
  GridApi, 
  GridReadyEvent, 
  IServerSideDatasource, 
  IServerSideGetRowsParams,
  ValueFormatterParams
} from 'ag-grid-community';
import { Subject, takeUntil } from 'rxjs';
import { TradeService } from '../../services/trade.service';
import { PriceStreamService } from '../../services/price-stream.service';
import { Trade, TradeSearchRequest } from '../../models/trade.model';
import { ColumnMetadata } from '../../models/column-metadata.model';
import { PriceUpdate } from '../../models/price-update.model';
import { ColumnChooserComponent } from '../column-chooser/column-chooser.component';

@Component({
  selector: 'app-trade-blotter',
  standalone: true,
  imports: [CommonModule, AgGridAngular, ColumnChooserComponent],
  templateUrl: './trade-blotter.component.html',
  styleUrls: ['./trade-blotter.component.css']
})
export class TradeBlotterComponent implements OnInit, OnDestroy {
  private gridApi!: GridApi;
  private destroy$ = new Subject<void>();
  
  columnDefs: ColDef[] = [];
  defaultColDef: ColDef = {
    sortable: true,
    filter: true,
    resizable: true,
    enableCellChangeFlash: true,
    suppressMenu: false
  };
  
  datasource?: IServerSideDatasource;
  allColumns: ColumnMetadata[] = [];
  selectedColumns: ColumnMetadata[] = [];
  showColumnChooser = false;
  streamConnected = false;
  updateCount = 0;
  
  constructor(
    private tradeService: TradeService,
    private priceStreamService: PriceStreamService
  ) {}

  // ADD THIS METHOD - Make sure it's here!
  getRowId(params: any): string {
    return params.data?.tradeId?.toString() || '';
  }
  
  ngOnInit() {
    this.loadColumnMetadata();
  }
  
  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.priceStreamService.disconnect();
  }
  
  loadColumnMetadata() {
    this.tradeService.getAllColumns()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (columns) => {
          this.allColumns = columns;
          
          // Load default GTID columns
          this.tradeService.getDefaultColumns()
            .pipe(takeUntil(this.destroy$))
            .subscribe({
              next: (defaultCols) => {
                this.selectedColumns = defaultCols;
                this.updateColumnDefs();
              },
              error: (err) => console.error('Error loading default columns:', err)
            });
        },
        error: (err) => console.error('Error loading all columns:', err)
      });
  }
  
  updateColumnDefs() {
    this.columnDefs = this.selectedColumns.map(col => {
      const colDef: ColDef = {
        field: col.fieldName,
        headerName: col.displayName,
        width: col.width,
        sortable: col.sortable,
        filter: col.filterable,
        cellClass: this.getCellClass(col),
        valueFormatter: this.getValueFormatter(col)
      };
      
      // Add custom renderer for PnL cells
      if (col.fieldName === 'pnl' || col.fieldName === 'mtm') {
        colDef.cellClass = (params) => {
          const value = params.value;
          const baseClass = 'pnl-cell number-cell';
          if (value > 0) return `${baseClass} pnl-positive`;
          if (value < 0) return `${baseClass} pnl-negative`;
          return baseClass;
        };
      }
      
      return colDef;
    });
    
    if (this.gridApi) {
      this.gridApi.setGridOption('columnDefs', this.columnDefs);
    }
  }
  
  getCellClass(col: ColumnMetadata): string | undefined {
    if (col.dataType === 'number') {
      return 'number-cell';
    }
    return undefined;
  }
  
  getValueFormatter(col: ColumnMetadata): ((params: ValueFormatterParams) => string) | undefined {
    if (col.dataType === 'number') {
      return (params: ValueFormatterParams) => {
        if (params.value == null) return '';
        return params.value.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });
      };
    }
    if (col.dataType === 'date') {
      return (params: ValueFormatterParams) => {
        if (!params.value) return '';
        return new Date(params.value).toLocaleDateString();
      };
    }
    return undefined;
  }
  
  onGridReady(params: GridReadyEvent) {
    this.gridApi = params.api;
    this.createDatasource();
  }
  
  createDatasource() {
    const requestedFields = this.selectedColumns.map(c => c.fieldName);
    
    this.datasource = {
      getRows: (params: IServerSideGetRowsParams) => {
        const request: TradeSearchRequest = {
          requestedFields,
          pageSize: 100,
          sortField: 'tradeDate',
          sortOrder: 'desc'
        };
        
        // Apply sorting from grid
        if (params.request.sortModel && params.request.sortModel.length > 0) {
          const sortModel = params.request.sortModel[0];
          request.sortField = sortModel.colId;
          request.sortOrder = sortModel.sort;
        }
        
        // FIX: Handle undefined startRow with nullish coalescing
        const startRow = params.request.startRow ?? 0;
        
        // Apply search_after for pagination
        if (startRow > 0) {
          // In real implementation, you'd track lastSearchAfter from previous response
          // For POC, we're using simple pagination
        }
        
        this.tradeService.searchTrades(request)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: (response) => {
              params.success({
                rowData: response.trades,
                rowCount: response.hasMore ? undefined : startRow + response.trades.length
              });
            },
            error: (err) => {
              console.error('Search error:', err);
              params.fail();
            }
          });
      }
    };
    
    if (this.gridApi) {
      this.gridApi.setGridOption('serverSideDatasource', this.datasource);
    }
  }
  
  connectPriceStream() {
    if (this.streamConnected) {
      return;
    }
    
    this.priceStreamService.connect()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (update) => this.applyPriceUpdate(update),
        error: (err) => {
          console.error('Price stream error:', err);
          this.streamConnected = false;
        }
      });
    
    this.streamConnected = true;
  }
  
  applyPriceUpdate(update: PriceUpdate) {
    if (!this.gridApi) return;
    
    // Find the row node by tradeId
    let rowNode: any = null;
    this.gridApi.forEachNode((node) => {
      if (node.data && node.data.tradeId === update.tradeId) {
        rowNode = node;
      }
    });
    
    if (rowNode) {
      // Update only the changed fields (delta update)
      const updatedData = { ...rowNode.data, ...update.updatedFields };
      
      // Use applyTransactionAsync for efficient cell-level updates
      this.gridApi.applyTransactionAsync({
        update: [updatedData]
      }, () => {
        this.updateCount++;
      });
    }
  }
  
  openColumnChooser() {
    this.showColumnChooser = true;
  }
  
  closeColumnChooser() {
    this.showColumnChooser = false;
  }
  
  onColumnsSelected(columns: ColumnMetadata[]) {
    this.selectedColumns = columns;
    this.updateColumnDefs();
    this.createDatasource(); // Refresh grid with new field projection
    this.closeColumnChooser();
  }
  
  disconnectStream() {
    this.priceStreamService.disconnect();
    this.streamConnected = false;
  }
}