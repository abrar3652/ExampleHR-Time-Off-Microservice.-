import { DataSource } from 'typeorm';
export declare class HcmClockService {
    private readonly dataSource;
    constructor(dataSource: DataSource);
    nowIso(): Promise<string>;
    advance(milliseconds: number): Promise<number>;
    reset(): Promise<void>;
}
