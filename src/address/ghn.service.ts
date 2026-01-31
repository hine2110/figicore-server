import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class GhnService {
    private readonly logger = new Logger(GhnService.name);
    private readonly apiUrl: string;
    private readonly token: string;
    private readonly shopId: string;

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
    ) {
        this.apiUrl = this.configService.get<string>('GHN_API_URL') ?? "";
        // Normalize: If env has /master-data suffix, remove it to get the true base
        if (this.apiUrl.endsWith('/master-data')) {
            this.apiUrl = this.apiUrl.replace('/master-data', '');
        }
        this.token = this.configService.get<string>('GHN_API_TOKEN') ?? "";
        this.shopId = this.configService.get<string>('GHN_SHOP_ID') ?? "";
    }

    private getHeaders() {
        return {
            'Token': this.token,
            'Content-Type': 'application/json',
            'ShopId': this.shopId // Some endpoints need ShopId
        };
    }

    async getProvinces() {
        const baseUrl = this.apiUrl.endsWith('/') ? this.apiUrl.slice(0, -1) : this.apiUrl;
        // API Base is now /public-api, so we append /master-data/province
        const url = `${baseUrl}/master-data/province`;
        this.logger.log(`Fetching Provinces from: ${url}`);

        try {
            const response = await lastValueFrom(
                this.httpService.get(url, { headers: this.getHeaders() })
            );
            return response.data; // GHN returns { code: 200, data: [...] }
        } catch (error) {
            this.logger.error(`GHN Error: ${error.message}`, error.response?.data);
            throw new HttpException(
                error.response?.data?.message || 'Failed to fetch provinces',
                error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    async getDistricts(provinceId: number) {
        const baseUrl = this.apiUrl.endsWith('/') ? this.apiUrl.slice(0, -1) : this.apiUrl;
        const url = `${baseUrl}/master-data/district`;
        try {
            const response = await lastValueFrom(
                this.httpService.get(url, {
                    headers: this.getHeaders(),
                    params: { province_id: provinceId }
                })
            );
            return response.data;
        } catch (error) {
            this.logger.error(`GHN Error: ${error.message}`);
            throw new HttpException('Failed to fetch districts', HttpStatus.BAD_REQUEST);
        }
    }

    async getWards(districtId: number) {
        const baseUrl = this.apiUrl.endsWith('/') ? this.apiUrl.slice(0, -1) : this.apiUrl;
        const url = `${baseUrl}/master-data/ward`;
        try {
            const response = await lastValueFrom(
                this.httpService.get(url, {
                    headers: this.getHeaders(),
                    params: { district_id: districtId }
                })
            );
            return response.data;
        } catch (error) {
            this.logger.error(`GHN Error: ${error.message}`);
            throw new HttpException('Failed to fetch wards', HttpStatus.BAD_REQUEST);
        }
    }

    async calculateFee(params: { to_district_id: number; to_ward_code: string; weight: number; insurance_value: number }) {
        const baseUrl = this.apiUrl.endsWith('/') ? this.apiUrl.slice(0, -1) : this.apiUrl;
        const url = `${baseUrl}/v2/shipping-order/fee`;

        const payload = {
            "service_type_id": 2, // Standard Delivery
            "insurance_value": params.insurance_value, // Product Value
            "coupon": null,
            "from_district_id": 1542, // Hanoi/Thanh Xuan (Example default)
            "to_district_id": params.to_district_id,
            "to_ward_code": params.to_ward_code,
            "height": 15,
            "length": 15,
            "weight": params.weight, // Grams
            "width": 15
        };

        try {
            const response = await lastValueFrom(
                this.httpService.post(url, payload, { headers: this.getHeaders() })
            );
            return response.data; // Returns { data: { total: 35000, ... } }
        } catch (error) {
            this.logger.error("GHN Fee Calc Failed", error.response?.data);
            // Fallback for dev/sandbox if API acts up or config is wrong
            return { data: { total: 30000 } };
        }
    }

    async calculateRealFee(params: { to_district_id: number; to_ward_code: string; weight: number; insurance_value: number }) {
        // 1. Force use of Public API (Not Master Data)
        const url = `https://dev-online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/fee`;

        // 2. Payload with FULL Insurance Value (Plan A: Safety First)
        // We declare the full value to ensure full compensation if lost
        const payload = {
            "service_type_id": 2, // Standard Delivery
            "insurance_value": params.insurance_value, // <--- KEY: Full Order Value
            "coupon": null,
            "from_district_id": 1542, // Configurable Shop District
            "to_district_id": params.to_district_id,
            "to_ward_code": params.to_ward_code,
            "height": 15, "length": 20, "width": 20, "weight": params.weight
        };

        try {
            const response = await lastValueFrom(
                this.httpService.post(url, payload, { headers: this.getHeaders() })
            );
            return response.data.data.total; // Returns the expensive fee (e.g., 100,000 VND)
        } catch (error) {
            this.logger.error("GHN Real Fee Error", error.response?.data);
            return 50000; // Fallback to a safe estimate if API fails
        }
    }
}
