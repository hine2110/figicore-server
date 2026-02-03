
import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { CreateEmployeeDto } from '../employees/dto/create-employee.dto';

import { UploadService } from '../upload/upload.service';

@Injectable()
export class UsersService {
  constructor(
      private prisma: PrismaService,
      private uploadService: UploadService
  ) { }

  async updateAvatar(userId: number, file: Express.Multer.File) {
      const user = await this.findOne(userId);
      if (!user) throw new NotFoundException('User not found');

      if (user.avatar_url) {
          throw new ForbiddenException("Bạn chỉ được phép cập nhật ảnh đại diện một lần duy nhất.");
      }

      const uploadResult = await this.uploadService.uploadFile(file, 'figicore_avatars');
      
      return this.prisma.users.update({
          where: { user_id: userId },
          data: { avatar_url: uploadResult.url }
      });
  }

  async resetAvatar(userId: number) {
      const user = await this.findOne(userId);
      if (!user) throw new NotFoundException('User not found');

      return this.prisma.users.update({
          where: { user_id: userId },
          data: { avatar_url: null }
      });
  }

  async create(data: any) {
    return this.prisma.users.create({
      data,
    });
  }

  async findByEmail(email: string) {
    return this.prisma.users.findUnique({
      where: { email },
      include: { customers: true },
    });
  }



  async findOne(id: number) {
    return this.prisma.users.findUnique({
      where: { user_id: id },
      include: { customers: true },
    });
  }

  async remove(id: number) {
    const user = await this.findOne(id);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    if (user.email === 'admin@figicore.com' || user.role_code === 'SUPER_ADMIN') {
      throw new ForbiddenException('Cannot delete Super Admin');
    }

    return this.prisma.users.delete({
      where: { user_id: id },
    });
  }

  // Placeholder methods for controller compatibility if needed
  findAll() {
    return this.prisma.users.findMany();
  }

  async getProfile(userId: number) {
    const user = await this.prisma.users.findUnique({
      where: { user_id: userId },
      include: {
        employees: true,
        customers: true,
        addresses: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const pendingRequest = await this.prisma.profile_update_requests.findFirst({
        where: { user_id: userId, status_code: 'PENDING' }
    });

    // Flatten Response
    return {
      ...user,
      // Employee Fields
      employee_code: user.employees?.employee_code || null,
      job_title_code: user.employees?.job_title_code || null,
      base_salary: user.employees?.base_salary || null,
      start_date: user.employees?.start_date || null,
      // Customer Fields (Optional, but good for consistency)
      loyalty_points: user.customers?.loyalty_points || 0,
      current_rank_code: user.customers?.current_rank_code || 'UNRANKED',
      has_pending_request: !!pendingRequest,
    };
  }

  async updateProfile(userId: number, data: { full_name?: string; phone?: string }) {
    // Check phone uniqueness if phone is provided
    if (data.phone) {
      const existingUser = await this.prisma.users.findUnique({
        where: { phone: data.phone },
      });

      if (existingUser && existingUser.user_id !== userId) {
        throw new BadRequestException('Phone number is already taken');
      }
    }

    return this.prisma.users.update({
      where: { user_id: userId },
      data: {
        full_name: data.full_name,
        phone: data.phone,
      },
    });
  }

  update(id: number, data: any) {
    return this.prisma.users.update({
      where: { user_id: id },
      data,
    });
  }

  async updateStatus(id: number, status: string, reason?: string) {
    const user = await this.findOne(id);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    // Safety Checks
    if (user.role_code === 'SUPER_ADMIN') {
      throw new ForbiddenException('Cannot change status of Super Admin');
    }

    // Prevent self-ban (Need to pass current user context ideally, but for now simple check)
    // NOTE: Controller should handle "Can't ban self" by checking Request user vs ID

    // If Banning, require reason (optional but good practice)
    if (status === 'BANNED' && !reason) {
        throw new BadRequestException('Reason is required when banning a user');
    }

    return this.prisma.users.update({
      where: { user_id: id },
      data: { 
          status_code: status,
          ban_reason: status === 'BANNED' ? reason : null // Clear reason if unbanning
      },
    });
  }
  async getPreviewEmail(role: string): Promise<{ email: string }> {
    const prefixMap: Record<string, string> = {
      'MANAGER': 'manager',
      'STAFF_POS': 'pos',
      'STAFF_INVENTORY': 'inventory',
      'SUPER_ADMIN': 'admin',
    };

    const prefix = prefixMap[role] || 'user';
    
    // Count existing users with this role to generate sequential number
    const count = await this.prisma.users.count({
      where: { role_code: role }
    });

    const nextNum = count + 1;
    return { email: `${prefix}${nextNum}@figicore.com` };
  }

  async getNextEmployeeId(role: string): Promise<{ code: string }> {
    const prefixMap: Record<string, string> = {
      'MANAGER': 'MGR',
      'STAFF_POS': 'POS',
      'STAFF_INVENTORY': 'INV',
    };

    const prefix = prefixMap[role] || 'EMP';

    const lastEmployee = await this.prisma.employees.findFirst({
      where: {
        employee_code: {
          startsWith: prefix
        }
      },
      orderBy: {
        created_at: 'desc',
      },
      select: { employee_code: true }
    });

    if (!lastEmployee || !lastEmployee.employee_code) {
      return { code: `${prefix}-001` };
    }

    // Regex to match PREFIX-XXX (where XXX are digits)
    const regex = new RegExp(`${prefix}-(\\d+)`);
    const match = lastEmployee.employee_code.match(regex);

    if (!match || !match[1]) {
        return { code: `${prefix}-001` };
    }

    const nextNum = parseInt(match[1], 10) + 1;
    const nextCode = `${prefix}-${nextNum.toString().padStart(3, '0')}`;
    
    return { code: nextCode };
  }

  async createBulk(dto: { users: CreateEmployeeDto[] }) {
    const defaultPassword = 'Figi@2026';
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(defaultPassword, saltRounds);

    return this.prisma.$transaction(async (tx) => {
      const createdEmployees: any[] = [];
      
      // Cache to store the "Next Available Number" for each prefix
      const nextNumberCache: Record<string, number> = {};

      for (const userDto of dto.users) {
          // 1. Determine Prefix
          let prefix = 'EMP';
          if (userDto.role_code === 'MANAGER') prefix = 'MGR';
          else if (userDto.role_code === 'STAFF_POS') prefix = 'POS';
          else if (userDto.role_code === 'STAFF_INVENTORY') prefix = 'INV';

          // 2. Calculate Next Number (Only once per prefix)
          if (nextNumberCache[prefix] === undefined) {
              // STRATEGY: Fetch ALL codes to find the true max (ignoring gaps/messy data)
              const allCodes = await tx.employees.findMany({
                  where: { employee_code: { startsWith: prefix } },
                  select: { employee_code: true }
              });

              // Extract numbers: "INV-005" -> 5
              const existingNumbers = allCodes
                  .map(e => {
                      const parts = e.employee_code.split('-');
                      return parts.length > 1 ? parseInt(parts[1], 10) : 0;
                  })
                  .filter(n => !isNaN(n))
                  .sort((a, b) => a - b); // Sort ascending

              // Find max
              const maxNum = existingNumbers.length > 0 ? existingNumbers[existingNumbers.length - 1] : 0;
              nextNumberCache[prefix] = maxNum + 1;
          } else {
              // If already calculated in this loop, just increment
              nextNumberCache[prefix]++;
          }

          const currentNum = nextNumberCache[prefix];

          // 3. Generate ID & Email
          const employeeCode = `${prefix}-${String(currentNum).padStart(3, '0')}`;
          const email = `${prefix.toLowerCase()}${currentNum}@figicore.com`;

          // 4. Create Records
          const newUser = await tx.users.create({
              data: {
                  full_name: userDto.full_name,
                  email: email,
                  password_hash: passwordHash, 
                  role_code: userDto.role_code,
                  phone: userDto.phone,
                  status_code: 'ACTIVE',
                  is_verified: true,
              }
          });

          const newEmployee = await tx.employees.create({
              data: {
                  user_id: newUser.user_id,
                  employee_code: employeeCode,
                  base_salary: Number(userDto.base_salary),
                  job_title_code: userDto.job_title_code || userDto.role_code,
                  start_date: userDto.start_date ? new Date(userDto.start_date) : new Date(),
              }
          });
          
          createdEmployees.push({ ...newUser, employee_details: newEmployee });
      }

      return createdEmployees;
    });
  }

  async createProfileUpdateRequest(userId: number, changes: any) {
    // Check for existing pending request
    const existing = await this.prisma.profile_update_requests.findFirst({
        where: { user_id: userId, status_code: 'PENDING' }
    });

    if (existing) {
        // Option A: Update existing request
        // return this.prisma.profile_update_requests.update({
        //     where: { request_id: existing.request_id },
        //     data: { changed_data: changes, updated_at: new Date() }
        // });
        // Option B: Throw error
        throw new BadRequestException('You verify have a pending profile update request.');
    }

    return this.prisma.profile_update_requests.create({
        data: {
            user_id: userId,
            changed_data: changes,
            status_code: 'PENDING'
        }
    });
  }

  async getPendingRequests() {
    return this.prisma.profile_update_requests.findMany({
      where: { status_code: 'PENDING' },
      include: {
        users: {
          select: {
            full_name: true,
            email: true,
            phone: true,
            avatar_url: true,
            role_code: true,
            employees: {
                select: { employee_code: true }
            }
          }
        }
      },
      orderBy: { created_at: 'desc' }
    });
  }

  async resolveRequest(requestId: number, status: 'APPROVED' | 'REJECTED') {
    const request = await this.prisma.profile_update_requests.findUnique({
        where: { request_id: requestId },
        include: { users: true }
    });

    if (!request) throw new NotFoundException('Request not found');
    if (request.status_code !== 'PENDING') throw new BadRequestException('Request already resolved');

    return this.prisma.$transaction(async (tx) => {
        // 1. Update Request Status
        const updatedRequest = await tx.profile_update_requests.update({
            where: { request_id: requestId },
            data: { status_code: status, updated_at: new Date() }
        });

        // 2. If Approved, Update User Profile
        if (status === 'APPROVED') {
            const changedData = request.changed_data as Prisma.JsonObject;
            const updateData: any = {};
            if (changedData['full_name']) updateData.full_name = changedData['full_name'];
            if (changedData['phone']) updateData.phone = changedData['phone'];
            if (changedData['avatar_url']) updateData.avatar_url = changedData['avatar_url'];
            
            if (Object.keys(updateData).length > 0) {
                await tx.users.update({
                    where: { user_id: request.user_id },
                    data: updateData
                });
            }

            // Handle Address Update (separate table)
            // Check both potential keys (frontend might send 'address' or 'default_address')
            const newAddress = (changedData['address'] || changedData['default_address']) as string;
            
            if (newAddress) {
                // Find default address to update
                const defaultAddress = await tx.addresses.findFirst({
                    where: { user_id: request.user_id, is_default: true }
                });

                if (defaultAddress) {
                    await tx.addresses.update({
                        where: { address_id: defaultAddress.address_id },
                        data: { detail_address: newAddress }
                    });
                } else {
                    // Create new address with fallback values for required fields
                    await tx.addresses.create({
                        data: {
                            user_id: request.user_id,
                            // Prefer new/updated info, fallback to existing profile info
                            recipient_name: updateData.full_name || request.users.full_name,
                            recipient_phone: updateData.phone || request.users.phone || 'N/A', 
                            detail_address: newAddress,
                            // Dummy values to satisfy constraints
                            province_id: 0, 
                            district_id: 0,
                            ward_code: 'UNMAPPED',
                            is_default: true
                        }
                    });
                }
            }
        }

        return updatedRequest;
    });
  }
}
