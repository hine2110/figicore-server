
import { SetMetadata } from '@nestjs/common';

export const ALLOW_ANY_IP_KEY = 'allow-any-ip';
export const AllowAnyIp = () => SetMetadata(ALLOW_ANY_IP_KEY, true);
