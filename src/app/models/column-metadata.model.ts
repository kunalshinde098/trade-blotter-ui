export interface ColumnMetadata {
  fieldName: string;
  displayName: string;
  dataType: string;
  filterable: boolean;
  sortable: boolean;
  width: number;
  category: string;
  description: string;
  defaultVisible: boolean;
}

export interface ColumnCategory {
  name: string;
  columns: ColumnMetadata[];
  expanded: boolean;
}