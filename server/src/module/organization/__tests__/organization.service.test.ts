import { organizationService } from '../organization.service';
import prisma from '../../../db';

jest.mock('../../../db', () => ({
  __esModule: true,
  default: {
    organization: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('../../logger/logger.service', () => ({
  loggerService: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Organization Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getOrganization', () => {
    it('returns the organization details', async () => {
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue({
        id: 'cust-1',
        name: 'Acme Corp',
        shortName: null,
        website: null,
        phone: null,
        email: null,
        address: null,
        city: null,
        state: null,
        zipCode: null,
        country: null,
        industry: null,
        description: null,
        logo: null,
      });

      const result = await organizationService.getOrganization('cust-1');

      expect(prisma.organization.findUnique).toHaveBeenCalledWith({ where: { id: 'cust-1' } });
      expect(result.name).toBe('Acme Corp');
    });

    it('throws when the organization does not exist', async () => {
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(organizationService.getOrganization('missing')).rejects.toThrow('Organization not found');
    });
  });

  describe('updateOrganization — shortName', () => {
    const updated = (over: Record<string, unknown> = {}) => ({
      name: 'Acme',
      shortName: null,
      website: null,
      phone: null,
      email: null,
      address: null,
      city: null,
      state: null,
      zipCode: null,
      country: null,
      industry: null,
      description: null,
      logo: null,
      ...over,
    });

    it('normalizes + persists a valid shortname after a uniqueness check', async () => {
      (prisma.organization.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.organization.update as jest.Mock).mockResolvedValue(updated({ shortName: 'acme-prod' }));

      const result = await organizationService.updateOrganization('cust-1', {
        name: 'Acme',
        shortName: '  Acme-Prod ',
      } as any);

      expect(prisma.organization.findFirst).toHaveBeenCalledWith({
        where: { shortName: 'acme-prod', id: { not: 'cust-1' } },
        select: { id: true },
      });
      expect((prisma.organization.update as jest.Mock).mock.calls[0][0].data.shortName).toBe('acme-prod');
      expect(result.shortName).toBe('acme-prod');
    });

    it('rejects an invalid shortname format with a 400', async () => {
      await expect(
        organizationService.updateOrganization('cust-1', { name: 'Acme', shortName: 'Bad Name!' } as any)
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(prisma.organization.update).not.toHaveBeenCalled();
    });

    it('rejects a duplicate shortname with a 409', async () => {
      (prisma.organization.findFirst as jest.Mock).mockResolvedValue({ id: 'other-cust' });

      await expect(
        organizationService.updateOrganization('cust-1', { name: 'Acme', shortName: 'taken' } as any)
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(prisma.organization.update).not.toHaveBeenCalled();
    });

    it('clears the shortname when an empty value is provided (no uniqueness check)', async () => {
      (prisma.organization.update as jest.Mock).mockResolvedValue(updated({ shortName: null }));

      await organizationService.updateOrganization('cust-1', { name: 'Acme', shortName: '' } as any);

      expect(prisma.organization.findFirst).not.toHaveBeenCalled();
      expect((prisma.organization.update as jest.Mock).mock.calls[0][0].data.shortName).toBeNull();
    });

    it('ignores non-editable fields (no mass-assignment)', async () => {
      (prisma.organization.update as jest.Mock).mockResolvedValue(updated());

      await organizationService.updateOrganization('cust-1', {
        name: 'Acme',
        isActive: false,
      } as any);

      const writtenData = (prisma.organization.update as jest.Mock).mock.calls[0][0].data;
      expect(writtenData).not.toHaveProperty('isActive');
      expect(writtenData.name).toBe('Acme');
    });
  });
});
