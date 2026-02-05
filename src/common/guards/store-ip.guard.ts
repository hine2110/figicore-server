
import {
    Injectable,
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class StoreIpGuard implements CanActivate {
    private readonly logger = new Logger(StoreIpGuard.name);

    constructor(private readonly prisma: PrismaService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const user = request.user;

        // 1. If no user, we can't check role (Guard likely placed after JwtAuthGuard)
        if (!user) {
            this.logger.warn('StoreIpGuard: No user found in request');
            return false;
        }

        const { role_code } = user;

        // 2. Bypass Roles
        const bypassRoles = ['SUPER_ADMIN', 'CUSTOMER'];
        if (bypassRoles.includes(role_code)) {
            return true;
        }

        // 3. Roles requiring IP Check
        const restrictedRoles = ['MANAGER', 'STAFF_POS', 'STAFF_INVENTORY'];
        if (!restrictedRoles.includes(role_code)) {
            // If role is not explicitly restricted or bypassed, we default to allow? 
            // Or block? Based on requirement, only these need check.
            // Assuming others are safe or handled elsewhere. 
            // For safety, let's allow, as requirement only specified restricted roles.
            return true;
        }

        // 4. Get Client IP
        // Handling standard express request.ip and potential proxy headers
        let clientIp = request.ip || request.connection.remoteAddress;

        // If behind proxy (e.g., Nginx), allow x-forwarded-for validation if needed
        // Simple normalization for IPv6 mapped IPv4
        if (clientIp.startsWith('::ffff:')) {
            clientIp = clientIp.substring(7);
        }

        // 5. Query DB
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
}
