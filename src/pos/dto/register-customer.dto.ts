import { IsNotEmpty, IsEmail, IsOptional, MinLength, Matches } from 'class-validator';

export class RegisterCustomerDto {
    @IsNotEmpty({ message: 'Họ tên không được để trống' })
    @MinLength(2, { message: 'Họ tên phải có ít nhất 2 ký tự' })
    full_name: string;

    @IsNotEmpty({ message: 'Số điện thoại không được để trống' })
    @Matches(/^0\d{9}$/, { message: 'Số điện thoại không hợp lệ (10 số, bắt đầu bằng 0)' })
    phone: string;

    @IsOptional()
    @IsEmail({}, { message: 'Email không hợp lệ' })
    email?: string;
}
