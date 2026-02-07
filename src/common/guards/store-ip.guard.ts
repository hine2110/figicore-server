
import {
    Injectable,
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Logger,
} from '@nestjs/common';
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

        const accessControl = await this.prisma.access_controls.findFirst({
            where: {
                role_code: role_code,
                ip_address: clientIp,
                is_active: true,
            },
        });

        if (accessControl) {
            return true;
        }

        this.logger.warn(`Access denied for user ${user.user_id} (${role_code}) from IP ${clientIp}`);
        throw new ForbiddenException(
            `Access denied. You must be connected to the Store Wifi (IP: ${clientIp}).`,
        );
    }

    private getClientIp(request: any): string {
        let ip = request.ip;

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
}
