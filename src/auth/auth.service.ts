
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) { }

  async validateUser(email: string, pass: string): Promise<any> {
    console.log(`Validating user: ${email}`);
    const user = await this.usersService.findByEmail(email);
    console.log('User found:', user ? 'Yes' : 'No');

    if (user && user.password_hash) {
      const isMatch = await bcrypt.compare(pass, user.password_hash);
      console.log('Password match:', isMatch);
      if (isMatch) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password_hash, ...result } = user;
        return result;
      }
    }
    return null;
  }

  async login(user: any) {
    const payload = {
      email: user.email,
      sub: user.user_id,
      role: user.role_code
    };
    return {
      access_token: this.jwtService.sign(payload),
      user: user,
    };
  }

  async register(userDto: any) {
    const saltOrRounds = 10;
    const hash = await bcrypt.hash(userDto.password, saltOrRounds);

    return this.usersService.create({
      email: userDto.email,
      password_hash: hash,
      full_name: userDto.fullName,
      phone: userDto.phone,
      role_code: 'CUSTOMER', // Default role
      status_code: 'ACTIVE', // Default status
    });
  }
}
