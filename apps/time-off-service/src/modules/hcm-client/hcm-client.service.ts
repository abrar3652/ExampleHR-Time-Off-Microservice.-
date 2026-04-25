import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { type AxiosInstance, type AxiosResponse } from 'axios';

import type { HcmResult } from './types';

@Injectable()
export class HcmClient {
  private readonly http: AxiosInstance;

  constructor(private readonly config: ConfigService) {
    const baseURL = this.config.get<string>('HCM_BASE_URL') ?? 'http://localhost:4000';
    this.http = axios.create({ baseURL });
  }

  get axios(): AxiosInstance {
    return this.http;
  }

  async callHcm<T>(
    fn: () => Promise<AxiosResponse<T>>,
    context: string,
  ): Promise<HcmResult<T>> {
    try {
      const response = await Promise.race([
        fn(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('HCM_TIMEOUT')), 8000)),
      ]);
      return { success: true, data: response.data, statusCode: response.status };
    } catch (err: any) {
      if (err.message === 'HCM_TIMEOUT') {
        return { success: false, reason: 'TIMEOUT' };
      }
      if (err.response) {
        const { status, data } = err.response;
        return {
          success: false,
          reason: status >= 500 ? 'SERVER_ERROR' : 'CLIENT_ERROR',
          statusCode: status,
          body: data,
        };
      }
      void context;
      return { success: false, reason: 'NETWORK_ERROR' };
    }
  }
}

