import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Injectable, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { addressSchema, type AddressView, type SessionUser } from '@mm/shared';
import type { z } from 'zod';
import { ApiError, ZodBody } from '../common/http.js';
import type { Address } from '../generated/prisma/client.js';
import { CurrentUser, Roles } from '../identity/auth.guard.js';
import { PrismaService } from '../platform/prisma.service.js';

export const addressView = (a: Address): AddressView => ({
  id: a.id,
  label: a.label,
  line1: a.line1,
  line2: a.line2,
  city: a.city,
  postcode: a.postcode,
  country: a.country,
  isDefault: a.isDefault,
});

@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const rows = await this.prisma.address.findMany({ where: { userId }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] });
    return rows.map(addressView);
  }

  /** The first address becomes the default; a new default replaces the old one. */
  async create(userId: string, input: z.output<typeof addressSchema>) {
    const created = await this.prisma.$transaction(async (tx) => {
      const count = await tx.address.count({ where: { userId } });
      const isDefault = input.isDefault || count === 0;
      if (isDefault) await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
      return tx.address.create({ data: { ...input, userId, isDefault } });
    });
    return addressView(created);
  }

  async makeDefault(userId: string, id: string) {
    await this.owned(userId, id);
    await this.prisma.$transaction([
      this.prisma.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } }),
      this.prisma.address.update({ where: { id }, data: { isDefault: true } }),
    ]);
    return this.list(userId);
  }

  async remove(userId: string, id: string) {
    const address = await this.owned(userId, id);
    if (address.isDefault && (await this.prisma.address.count({ where: { userId } })) > 1) {
      throw new ApiError(HttpStatus.CONFLICT, 'Make another address the default before removing this one.', { code: 'default_address' });
    }
    // Orders keep their own copy of the address, so removing it never changes past orders.
    await this.prisma.address.delete({ where: { id } });
  }

  async owned(userId: string, id: string) {
    const address = await this.prisma.address.findFirst({ where: { id, userId } });
    if (!address) throw new ApiError(HttpStatus.NOT_FOUND, 'Address not found.', { code: 'not_found' });
    return address;
  }
}

@Roles('customer')
@Controller('addresses')
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.addresses.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: SessionUser, @Body(new ZodBody(addressSchema)) body: z.output<typeof addressSchema>) {
    return this.addresses.create(user.id, body);
  }

  @Post(':id/default')
  @HttpCode(200)
  makeDefault(@CurrentUser() user: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.addresses.makeDefault(user.id, id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.addresses.remove(user.id, id);
  }
}
