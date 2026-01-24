import { IsEmail, IsNotEmpty, Length } from 'class-validator';

export class VerifyOtpDto {
    @IsEmail({}, { message: 'Invalid email address' })
    @IsNotEmpty({ message: 'Email is required' })
    email: string;

    @IsNotEmpty({ message: 'OTP is required' })
    @Length(6, 6, { message: 'OTP must be exactly 6 characters' })
    otp: string;
}
