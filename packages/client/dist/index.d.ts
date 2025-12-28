export declare interface AddCatalogTableResponse {
    status: 'ok';
    message: string;
    tables: Record<string, string>;
}

export declare interface CatalogResponse {
    tables: Record<string, string>;
}

export declare interface DeleteCatalogTableResponse {
    status: 'ok';
    message: string;
    tables: Record<string, string>;
}

export declare class GagaraClient {
    private baseUrl;
    private token;
    constructor(config: GagaraConfig);
    private request;
    query<T = any>(sql: string, options?: QueryOptions): Promise<T[]>;
    getCatalog(): Promise<Record<string, string>>;
    refreshCatalog(): Promise<Record<string, string>>;
    addCatalogTable(name: string, path: string): Promise<Record<string, string>>;
    deleteCatalogTable(name: string): Promise<Record<string, string>>;
}

export declare interface GagaraConfig {
    baseUrl: string;
    token: string;
}

export declare class GagaraError extends Error {
    code: string;
    details?: any;
    constructor(response: GagaraErrorResponse);
}

export declare interface GagaraErrorResponse {
    error: string;
    code: string;
    details?: {
        hint?: string;
        [key: string]: any;
    };
}

export declare type GagaraFormat = 'json' | 'csv';

export declare class GagaraHttpError extends Error {
    status: number;
    statusText: string;
    constructor(response: Response);
}

export declare interface QueryOptions {
    format?: GagaraFormat;
    signal?: AbortSignal;
}

export declare interface QueryRequest {
    sql: string;
}

export declare interface QueryResponse<T = any> {
    data: T[];
    format: 'json';
    rowCount: number;
}

export declare interface RefreshCatalogResponse {
    status: 'ok';
    message: string;
    tables: Record<string, string>;
}

export { }
