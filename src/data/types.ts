export interface YearData {
    readonly population: number;
    readonly births: number;
    readonly deaths: number;
}
export interface PlaceSeries {
    readonly id: string;
    readonly years: Readonly<Record<string, YearData | null>>;
}
export interface YearRange {
    readonly start: number;
    readonly end: number;
}
export interface PlaceMetadata {
    readonly id: string;
    readonly name: string;
    readonly aliases: readonly string[];
    readonly kind: 'world' | 'region' | 'country';
    readonly iso2: string | null;
    readonly coverage: YearRange;
}
export interface DataConstants {
    readonly Pmax: number;
    readonly rmax: number;
    readonly range: YearRange;
}
export interface DataManifest {
    readonly revision: string;
    readonly source: {
        readonly title: string;
        readonly publisher: string;
        readonly variant: 'Medium';
        readonly units: 'persons';
        readonly sourceUnits: 'thousands of persons';
        readonly url: string;
        readonly sha256: string;
    };
    readonly files: Readonly<Record<string, string>>;
}
