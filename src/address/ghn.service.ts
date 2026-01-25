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
        // Remove trailing slash if exists to avoid double slash issues, though robust concatenation is better
        const baseUrl = this.apiUrl.endsWith('/') ? this.apiUrl.slice(0, -1) : this.apiUrl;
        // The master-data endpoint might be required depending on GHN version, usually it is .../master-data/province
        // User diagnosis said ".../master-data" + "province" became ".../master-dataprovince". 
        // If env is "https://online-gateway.ghn.vn/shiip/public-api/master-data", we need to append "/province".
        const url = `${baseUrl}/province`;
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
        const url = `${baseUrl}/district`;
        try {
            const response = await lastValueFrom(
                this.httpService.get(url, {
                    headers: this.getHeaders(),
                    params: { province_id: provinceId } // GET request uses params
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
        const url = `${baseUrl}/ward`;
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
}
