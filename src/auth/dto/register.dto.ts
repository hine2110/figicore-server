
import { IsEmail, IsNotEmpty, MinLength, Matches } from 'class-validator';

export class RegisterDto {
    @IsEmail({}, { message: 'Invalid email address' })
    @IsNotEmpty({ message: 'Email is required' })
    email: string;

    @MinLength(6, { message: 'Password must be at least 6 characters long' })
    password: string;

    @IsNotEmpty({ message: 'Full Name is required' })
    fullName: string;

    @IsNotEmpty({ message: 'Phone number is required' })
    @Matches(/(84|0[3|5|7|8|9])+([0-9]{8})\b/, { message: 'Invalid Vietnam phone number' })
    phone: string;
}
