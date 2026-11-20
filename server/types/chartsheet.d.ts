declare module "chartsheet" {
  export interface ChartSeries {
    ref: string;
    nameRef?: string;
    name?: string;
    colour?: string;
    color?: string;
  }
  export interface ChartSpec {
    type: "bar" | "column" | "line" | "pie" | "doughnut" | "area" | "scatter" | "radar";
    title?: string;
    series: ChartSeries[];
    categories?: string;
    sheet?: string;
    anchor?: { col: number; row: number; colOffset?: number; rowOffset?: number };
    width?: number;
    height?: number;
    stacked?: boolean;
    horizontal?: boolean;
    dataLabels?: boolean;
    legend?: "r" | "l" | "t" | "b" | false;
    numberFormat?: string;
    gridlines?: boolean;
    xTitle?: string;
    yTitle?: string;
  }
  export function addChart(workbook: unknown, spec: ChartSpec): Promise<Buffer>;
  export function addCharts(workbook: unknown, specs: ChartSpec[]): Promise<Buffer>;
  export function validate(workbook: unknown): Promise<{ valid: boolean; errors: string[]; warnings: string[] }>;
}
