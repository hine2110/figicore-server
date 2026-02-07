import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccessControlDto } from './dto/create-access-control.dto';

@Injectable()
export class AccessControlService {
    constructor(private readonly prisma: PrismaService) { }

    async create(createAccessControlDto: CreateAccessControlDto) {
        return this.prisma.access_controls.create({
            data: {
                role_code: createAccessControlDto.role_code,
                ip_address: createAccessControlDto.ip_address,
                description: createAccessControlDto.description,
                is_active: createAccessControlDto.is_active ?? true,
            },
        });
    }

    async findAll(role_code?: string) {
        const where = role_code ? { role_code } : {};
        return this.prisma.access_controls.findMany({
            where,
            orderBy: { created_at: 'desc' },
        });
    }

    async toggleActive(id: number) {
        const control = await this.prisma.access_controls.findUniqueOrThrow({
            where: { control_id: id },
        });

        return this.prisma.access_controls.update({
            where: { control_id: id },
            data: { is_active: !control.is_active },
        });
    }

    async remove(id: number) {
        return this.prisma.access_controls.delete({
            where: { control_id: id },
        });
    }
}
