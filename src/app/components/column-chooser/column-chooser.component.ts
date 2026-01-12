import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ColumnMetadata, ColumnCategory } from '../../models/column-metadata.model';

@Component({
  selector: 'app-column-chooser',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './column-chooser.component.html',
  styleUrls: ['./column-chooser.component.css']
})
export class ColumnChooserComponent implements OnInit {
  @Input() allColumns: ColumnMetadata[] = [];
  @Input() selectedColumns: ColumnMetadata[] = [];
  @Output() columnsSelected = new EventEmitter<ColumnMetadata[]>();
  @Output() close = new EventEmitter<void>();
  
  categories: ColumnCategory[] = [];
  searchTerm = '';
  tempSelectedColumns: Set<string> = new Set();
  
  ngOnInit() {
    // Initialize temp selection
    this.tempSelectedColumns = new Set(this.selectedColumns.map(c => c.fieldName));
    
    // Group columns by category
    this.groupColumnsByCategory();
  }
  
  groupColumnsByCategory() {
    const categoryMap = new Map<string, ColumnMetadata[]>();
    
    this.allColumns.forEach(col => {
      if (!categoryMap.has(col.category)) {
        categoryMap.set(col.category, []);
      }
      categoryMap.get(col.category)!.push(col);
    });
    
    this.categories = Array.from(categoryMap.entries()).map(([name, columns]) => ({
      name,
      columns,
      expanded: true
    }));
  }
  
  toggleCategory(category: ColumnCategory) {
    category.expanded = !category.expanded;
  }
  
  isColumnSelected(fieldName: string): boolean {
    return this.tempSelectedColumns.has(fieldName);
  }
  
  toggleColumn(column: ColumnMetadata) {
    if (this.tempSelectedColumns.has(column.fieldName)) {
      this.tempSelectedColumns.delete(column.fieldName);
    } else {
      this.tempSelectedColumns.add(column.fieldName);
    }
  }
  
  selectAll(category: ColumnCategory) {
    category.columns.forEach(col => this.tempSelectedColumns.add(col.fieldName));
  }
  
  deselectAll(category: ColumnCategory) {
    category.columns.forEach(col => this.tempSelectedColumns.delete(col.fieldName));
  }
  
  resetToDefaults() {
    this.tempSelectedColumns.clear();
    this.allColumns
      .filter(col => col.defaultVisible)
      .forEach(col => this.tempSelectedColumns.add(col.fieldName));
  }
  
  applySelection() {
    const selected = this.allColumns.filter(col => 
      this.tempSelectedColumns.has(col.fieldName)
    );
    this.columnsSelected.emit(selected);
  }
  
  cancel() {
    this.close.emit();
  }
  
  getFilteredColumns(category: ColumnCategory): ColumnMetadata[] {
    if (!this.searchTerm) {
      return category.columns;
    }
    
    const term = this.searchTerm.toLowerCase();
    return category.columns.filter(col => 
      col.displayName.toLowerCase().includes(term) ||
      col.fieldName.toLowerCase().includes(term)
    );
  }
  
  get selectedCount(): number {
    return this.tempSelectedColumns.size;
  }
}