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
import { TradeService } from '../../services/trade.service';
import { PriceStreamService } from '../../services/price-stream.service';
import { Trade, TradeSearchRequest } from '../../models/trade.model';
import { ColumnMetadata } from '../../models/column-metadata.model';
import { PriceUpdate } from '../../models/price-update.model';
import { ColumnChooserComponent } from '../column-chooser/column-chooser.component';

import { ModuleRegistry } from "ag-grid-community";
import { AllEnterpriseModule, LicenseManager, IntegratedChartsModule } from "ag-grid-enterprise";
import { AgChartsEnterpriseModule } from "ag-charts-enterprise";
import { Subject, takeUntil, finalize } from 'rxjs';

ModuleRegistry.registerModules([
    AllEnterpriseModule,
    IntegratedChartsModule.with(AgChartsEnterpriseModule)
]);

LicenseManager.setLicenseKey("[TRIAL]_this_{AG_Charts_and_AG_Grid}_Enterprise_key_{AG-117502}_is_granted_for_evaluation_only___Use_in_production_is_not_permitted___Please_report_misuse_to_legal@ag-grid.com___For_help_with_purchasing_a_production_key_please_contact_info@ag-grid.com___You_are_granted_a_{Single_Application}_Developer_License_for_one_application_only___All_Front-End_JavaScript_developers_working_on_the_application_would_need_to_be_licensed___This_key_will_deactivate_on_{11 February 2026}____[v3]_[0102]_MTc3MDc2ODAwMDAwMA==0161f97d1f9bc3fa8bee90aa4583dd3d");

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
  private scrollTimeout: any;
  
  columnDefs: ColDef[] = [];
  defaultColDef: ColDef = {
    sortable: true,
    filter: true,
    resizable: true,
    enableCellChangeFlash: true
  };
  
  datasource?: IServerSideDatasource;
  allColumns: ColumnMetadata[] = [];
  selectedColumns: ColumnMetadata[] = [];
  showColumnChooser = false;
  streamConnected = false;
  updateCount = 0;

  // Add these properties
  rowModelType: 'serverSide' = 'serverSide';
  cacheBlockSize = 100;
  maxBlocksInCache = 2; // Reduced from 10
  maxConcurrentDatasourceRequests = 1; // Only 1 request at a time
  blockLoadDebounceMillis = 300; // Debounce rapid requests
  
  // Track pagination state
  private lastSearchAfter: any[] | null = null;
  private isLoadingData = false; // Prevent duplicate requests

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
    clearTimeout(this.scrollTimeout);
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
    
    // Debounced scroll handler - waits 1 second after scrolling stops
    params.api.addEventListener('bodyScroll', () => {
      if (!this.streamConnected) return;
      
      // Clear existing timeout
      clearTimeout(this.scrollTimeout);
      
      // Set new timeout - will only execute after 1 second of no scrolling
      this.scrollTimeout = setTimeout(() => {
        if (this.streamConnected) {
          this.reconnectWithVisibleTrades();
        }
      }, 1000);
    });
  }
  
  private reconnectWithVisibleTrades() {
    if (!this.streamConnected) return;
    
    // Step 1: Disconnect existing stream
    this.priceStreamService.disconnect();
    
    // Step 2: Get new visible trade IDs (only viewport)
    const visibleTradeIds: string[] = [];
    const firstRow = this.gridApi.getFirstDisplayedRowIndex();
    const lastRow = this.gridApi.getLastDisplayedRowIndex();
    
    // Use forEachNode for server-side row model
    this.gridApi.forEachNode((node) => {
      if (node.rowIndex !== null && node.rowIndex >= firstRow && node.rowIndex <= lastRow && node.data?.tradeId) {
        visibleTradeIds.push(node.data.tradeId);
      }
    });
    
    console.log('Reconnecting SSE for visible trades:', visibleTradeIds.length);
    
    // Step 3: Reconnect SSE with updated subscription (only visible trades)
    this.priceStreamService.connect(visibleTradeIds)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (update) => this.applyPriceUpdate(update),
        error: (err) => {
          console.error('Price stream error:', err);
          this.streamConnected = false;
        }
      });
  } 

  createDatasource() {
    const requestedFields = this.selectedColumns.map(c => c.fieldName);

    this.datasource = {
      getRows: (params: IServerSideGetRowsParams) => {
        // Prevent duplicate requests
        if (this.isLoadingData) {
          console.warn('Request already in progress, skipping');
          return;
        }

        this.isLoadingData = true;

        console.log('SSRM getRows called:', {
          startRow: params.request.startRow,
          endRow: params.request.endRow,
          sortModel: params.request.sortModel
        });

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

        // Apply search_after for pagination
        const startRow = params.request.startRow ?? 0;
        if (startRow > 0 && this.lastSearchAfter) {
          request.searchAfter = this.lastSearchAfter;
        } else {
          // Reset for new sort/filter
          this.lastSearchAfter = null;
        }

        this.tradeService.searchTrades(request)
          .pipe(
            takeUntil(this.destroy$),
            finalize(() => {
              this.isLoadingData = false;
            })
          )
          .subscribe({
            next: (response) => {
              console.log('Search response:', {
                tradesCount: response.trades.length,
                hasMore: response.hasMore,
                startRow: startRow
              });

              // Store lastSearchAfter for next pagination
              this.lastSearchAfter = response.lastSearchAfter;

              // CRITICAL: Proper rowCount calculation
              let rowCount: number | undefined;

              if (response.trades.length === 0) {
                // No data returned - use startRow as final count
                rowCount = startRow;
              } else if (!response.hasMore) {
                // Last page - exact count
                rowCount = startRow + response.trades.length;
              } else {
                // More data available - keep loading
                rowCount = undefined;
              }

              console.log('Calling params.success with rowCount:', rowCount);

              params.success({
                rowData: response.trades,
                rowCount: rowCount
              });
            },
            error: (err) => {
              console.error('Search error:', err);
              this.isLoadingData = false;
              params.fail();
            }
          });
      }
    };

    if (this.gridApi) {
      // Clear existing cache when setting new datasource
      this.gridApi.setGridOption('serverSideDatasource', this.datasource);
    }
  }
  
  connectPriceStream() {
    if (this.streamConnected) return;
    
    // Get visible trade IDs (only viewport)
    const visibleTradeIds: string[] = [];
    const firstRow = this.gridApi.getFirstDisplayedRowIndex();
    const lastRow = this.gridApi.getLastDisplayedRowIndex();
    
    // Use forEachNode for server-side row model
    this.gridApi.forEachNode((node) => {
      if (node.rowIndex !== null && node.rowIndex >= firstRow && node.rowIndex <= lastRow && node.data?.tradeId) {
        visibleTradeIds.push(node.data.tradeId);
      }
    });
    
    console.log('Connecting price stream for', visibleTradeIds.length, 'visible trades');
    
    this.priceStreamService.connect(visibleTradeIds)
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
    if (!this.gridApi) {
      console.warn('Grid API not ready');
      return;
    }
    
    console.log('Applying update for tradeId:', update.tradeId);
    
    // For SSRM, we need to use transaction API differently
    // First, try to find if the row is currently displayed
    let found = false;
    
    this.gridApi.forEachNode((node) => {
      if (node.data && node.data.tradeId === update.tradeId) {
        found = true;
        console.log('Found node, applying update');
        
        // Update the node data directly
        Object.assign(node.data, update.updatedFields);
        
        // Refresh the specific cells
        this.gridApi.refreshCells({
          rowNodes: [node],
          force: true
        });
        
        this.updateCount++;
      }
    });
    
    if (!found) {
      console.log('Trade not currently visible in grid');
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