"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const hcm_client_service_1 = require("../../src/modules/hcm-client/hcm-client.service");
jest.mock('axios');
const mockedAxios = jest.mocked(axios_1.default);
describe('HcmClient.callHcm', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        mockedAxios.create.mockReturnValue({});
    });
    afterEach(() => {
        jest.useRealTimers();
        jest.resetAllMocks();
    });
    it('returns TIMEOUT when fn resolves after 9 seconds', async () => {
        const client = new hcm_client_service_1.HcmClient({ get: () => undefined });
        const promise = client.callHcm(() => new Promise((resolve) => {
            setTimeout(() => resolve({ data: { ok: true }, status: 200 }), 9000);
        }), 'ctx');
        await jest.advanceTimersByTimeAsync(8000);
        await expect(promise).resolves.toEqual({ success: false, reason: 'TIMEOUT' });
    });
    it('returns SERVER_ERROR on status 500', async () => {
        const client = new hcm_client_service_1.HcmClient({ get: () => undefined });
        const result = await client.callHcm(() => Promise.reject({
            response: { status: 500, data: { message: 'boom' } },
        }), 'ctx');
        expect(result).toEqual({
            success: false,
            reason: 'SERVER_ERROR',
            statusCode: 500,
            body: { message: 'boom' },
        });
    });
    it('returns CLIENT_ERROR on status 422', async () => {
        const client = new hcm_client_service_1.HcmClient({ get: () => undefined });
        const result = await client.callHcm(() => Promise.reject({
            response: { status: 422, data: { message: 'bad' } },
        }), 'ctx');
        expect(result).toEqual({
            success: false,
            reason: 'CLIENT_ERROR',
            statusCode: 422,
            body: { message: 'bad' },
        });
    });
});
//# sourceMappingURL=hcm-client.spec.js.map