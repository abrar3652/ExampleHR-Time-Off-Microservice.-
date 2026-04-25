import { ConfigService } from '@nestjs/config';
import { type AxiosInstance, type AxiosResponse } from 'axios';
import type { HcmResult } from './types';
export declare class HcmClient {
    private readonly config;
    private readonly http;
    constructor(config: ConfigService);
    get axios(): AxiosInstance;
    callHcm<T>(fn: () => Promise<AxiosResponse<T>>, context: string): Promise<HcmResult<T>>;
}
