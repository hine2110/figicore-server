import {
    Injectable,
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Logger,
} from '@nestjs/common';
// @ts-ignore
import { Reflector } from '@nestjs/core';
import { ALLOW_ANY_IP_KEY } from '../decorators/allow-any-ip.decorator';
import { PrismaService } from '../../prisma/prisma.service';


@Injectable()
export class StoreIpGuard implements CanActivate {
    private readonly logger = new Logger(StoreIpGuard.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly reflector: Reflector,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const user = request.user;

        // 1. If no user, we can't check role (Guard likely placed after JwtAuthGuard)
        if (!user) {
            this.logger.warn('StoreIpGuard: No user found in request');
            return false;
        }

        const { role_code } = user;

        // 2. Bypass Roles (Admins, Customers, Guests)
        const bypassRoles = ['SUPER_ADMIN', 'CUSTOMER'];
        if (bypassRoles.includes(role_code)) {
            return true;
        }

        // 3. Flexible Mode: Check for @AllowAnyIp decorator
        const allowAnyIp = this.reflector.getAllAndOverride<boolean>(ALLOW_ANY_IP_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (allowAnyIp) {
            return true;
        }

        // 4. Roles requiring IP Check (Strict Mode)
        const restrictedRoles = ['MANAGER', 'STAFF_POS', 'STAFF_INVENTORY'];
        if (!restrictedRoles.includes(role_code)) {
            // For safety, let's allow if not restricted, as requirement only specified restricted roles.
            return true;
        }

        // 5. Get Client IP & Strict Check
        let clientIp = this.getClientIp(request);
        this.logger.log(`Checking Access - User: ${user.user_id} (${role_code}) - IP: ${clientIp}`);

        // Lấy TẤT CẢ các cấu hình IP đang active của role này
        const accessControls = await this.prisma.access_controls.findMany({
            where: {
                role_code: role_code,
                is_active: true,
            },
        });

        // 6. Kiểm tra xem IP thật có nằm trong bất kỳ cấu hình nào đã lưu không (Hỗ trợ CIDR)
        const isAllowed = accessControls.some(control =>
            this.checkIpInRange(clientIp, control.ip_address)
        );

        if (isAllowed) {
            return true;
        }

        this.logger.warn(`Access denied for user ${user.user_id} (${role_code}) from IP ${clientIp}`);
        throw new ForbiddenException(
            `Access denied. You must be connected to the Store Wifi (IP: ${clientIp}).`,
        );
    }

    private getClientIp(request: any): string {
        // Ưu tiên số 1: Lấy IP từ header độc quyền của Cloudflare
        let ip = request.headers['cf-connecting-ip'] || request.headers['x-forwarded-for'] || request.ip;

        // Xử lý trường hợp có nhiều IP do đi qua nhiều proxy (lấy IP đầu tiên)
        if (typeof ip === 'string' && ip.includes(',')) {
            ip = ip.split(',')[0].trim();
        }

        // Xử lý IPv6 mapping sang IPv4
        if (ip.startsWith('::ffff:')) {
            ip = ip.substring(7);
        }

        // Xử lý Localhost IPv6 
        if (ip === '::1') {
            ip = '127.0.0.1';
        }

        return ip;
    }

    // Hàm hỗ trợ kiểm tra IP có nằm trong dải CIDR không (Không cần cài thêm thư viện)
    private checkIpInRange(clientIp: string, storedIpOrRange: string): boolean {
        // Nếu lưu IP tĩnh bình thường (VD: 14.232.115.12)
        if (!storedIpOrRange.includes('/')) {
            return clientIp === storedIpOrRange;
        }

        // Nếu lưu theo dải mạng CIDR (VD: 14.232.0.0/16)
        try {
            const [rangeIp, subnetStr] = storedIpOrRange.split('/');
            const subnet = parseInt(subnetStr, 10);

            // Chuyển đổi chuỗi IPv4 thành số nguyên (integer) để so sánh bit
            const ipToInt = (ipStr: string) =>
                ipStr.split('.').reduce((int, octet) => (int << 8) + parseInt(octet, 10), 0) >>> 0;

            const rangeInt = ipToInt(rangeIp);
            const clientInt = ipToInt(clientIp);

            // Tính toán subnet mask
            const maskInt = (0xffffffff << (32 - subnet)) >>> 0;

            // So sánh phần Network ID của cả 2 IP
            return (clientInt & maskInt) === (rangeInt & maskInt);
        } catch (error) {
            this.logger.error(`Invalid IP format in database: ${storedIpOrRange}`);
            return false;
        }
    }
}