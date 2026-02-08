
import { Controller, Get, Post, Body, Param, Delete, UseGuards, Req, BadRequestException, Put } from '@nestjs/common';
import { GhnService } from './ghn.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('address')
export class AddressController {
    constructor(
        private readonly ghnService: GhnService,
        private readonly prisma: PrismaService,
    ) { }

    // --- Master Data (Proxy to GHN) ---

    @Get('provinces')
    getProvinces() {
        return this.ghnService.getProvinces();
    }

    @Get('districts/:province_id')
    getDistricts(@Param('province_id') provinceId: string) {
        return this.ghnService.getDistricts(Number(provinceId));
    }

    @Get('wards/:district_id')
    getWards(@Param('district_id') districtId: string) {
        return this.ghnService.getWards(Number(districtId));
    }

    @Post('calculate-fee')
    @UseGuards(AuthGuard('jwt'))
    async calculateShippingFee(@Body() body: { address_id: number; total_amount: number }) {
        // 1. Get Address Details
        const address = await this.prisma.addresses.findUnique({ where: { address_id: body.address_id } });
        if (!address) throw new BadRequestException('Address not found');

        // 2. Get Real Cost from GHN (Internal) - Calls strict API with full insurance
        const realFee = await this.ghnService.calculateRealFee({
            to_district_id: address.district_id,
            to_ward_code: address.ward_code,
            weight: 2000, // Estimate 2kg for figures, or pass actual weight
            insurance_value: body.total_amount
        });

        // 3. Apply Subsidy Logic (Business Rule: Fixed 30k)
        const customerFee = 30000; // Flat Rate: 30k default (Strict)

        // Policy: Free Ship > 5M is currently DISABLED by request.
        // if (body.total_amount >= 5000000) { customerFee = 0; }

        // 4. Return BOTH values
        // 'fee': What the user sees (Subsidized)
        // 'original_fee': The actual cost (hidden), needed for "Shipping Debt" tracking
        return {
            fee: customerFee,
            original_fee: realFee
        };
    }

    // --- User Address CRUD ---

    @Post()
    @UseGuards(AuthGuard('jwt'))
    async createAddress(@Req() req, @Body() data: any) {
        const userId = req.user.user_id;

        // Validate required fields
        if (!data.recipient_name || !data.recipient_phone || !data.province_id || !data.district_id || !data.ward_code || !data.detail_address) {
            throw new BadRequestException('Missing required address fields');
        }

        // Handle is_default logic
        if (data.is_default) {
            await this.prisma.addresses.updateMany({
                where: { user_id: userId },
                data: { is_default: false },
            });
        } else {
            // If this is the FIRST address, force it to be default
            const count = await this.prisma.addresses.count({ where: { user_id: userId } });
            if (count === 0) {
                data.is_default = true;
            }
        }

        return this.prisma.addresses.create({
            data: {
                user_id: userId,
                recipient_name: data.recipient_name,
                recipient_phone: data.recipient_phone,
                province_id: Number(data.province_id),
                province_name: data.province_name,
                district_id: Number(data.district_id),
                district_name: data.district_name,
                ward_code: String(data.ward_code),
                ward_name: data.ward_name,
                detail_address: data.detail_address,
                is_default: data.is_default || false,
            },
        });
    }

    @Get()
    @UseGuards(AuthGuard('jwt'))
    getMyAddresses(@Req() req) {
        return this.prisma.addresses.findMany({
            where: {
                user_id: req.user.user_id,
                deleted_at: null
            },
            orderBy: { is_default: 'desc' },
        });
    }

    @Put(':id')
    @UseGuards(AuthGuard('jwt'))
    async updateAddress(@Req() req, @Param('id') id: string, @Body() data: any) {
        const userId = req.user.user_id;
        const addressId = Number(id);

        // Verify ownership
        const existingAddress = await this.prisma.addresses.findFirst({
            where: { address_id: addressId, user_id: userId, deleted_at: null },
        });

        if (!existingAddress) {
            throw new BadRequestException('Address not found');
        }

        // Handle is_default logic
        if (data.is_default) {
            await this.prisma.addresses.updateMany({
                where: { user_id: userId },
                data: { is_default: false },
            });
        }

        return this.prisma.addresses.update({
            where: { address_id: addressId },
            data: {
                recipient_name: data.recipient_name,
                recipient_phone: data.recipient_phone,
                province_id: Number(data.province_id),
                district_id: Number(data.district_id),
                ward_code: String(data.ward_code),
                detail_address: data.detail_address,
                is_default: data.is_default,
                updated_at: new Date(),
            },
        });
    }

    @Delete(':id')
    @UseGuards(AuthGuard('jwt'))
    async deleteAddress(@Req() req, @Param('id') id: string) {
        const userId = req.user.user_id;
        const addressId = Number(id);

        // Verify ownership
        const address = await this.prisma.addresses.findFirst({
            where: { address_id: addressId, user_id: userId, deleted_at: null },
        });

        if (!address) {
            throw new BadRequestException('Address not found or access denied');
        }

        // Constraint: Cannot delete default address if it's not the only one
        if (address.is_default) {
            const totalAddresses = await this.prisma.addresses.count({
                where: { user_id: userId, deleted_at: null }
            });

            if (totalAddresses > 1) {
                throw new BadRequestException('Cannot delete default address. Please set another address as default first.');
            }
        }

        // Soft delete
        return this.prisma.addresses.update({
            where: { address_id: addressId },
            data: { deleted_at: new Date() },
        });
    }
}
