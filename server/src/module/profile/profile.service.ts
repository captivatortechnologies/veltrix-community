import prisma from '../../db';
import { 
  ProfileUpdateRequestType, 
  ProfileResponseType,
  SettingsUpdateRequestType,
  SettingsResponseType
} from './profile.schema';
import { loggerService } from '../../module/logger/logger.service';

export const profileService = {
  // Get user profile
  async getProfile(userId: string): Promise<ProfileResponseType> {
    loggerService.info(`Fetching profile for user ID ${userId}`);
    
    // Get user with profile data
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: true,
        // Relation field name is unchanged by the Customer -> Organization
        // model rename — see the note at the top of schema.prisma.
        customer: true,
        profile: true
      }
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Return user profile
    return {
      id: user.id,
      name: user.name || '',
      email: user.email,
      role: user.role.name,
      organization: user.customer.name,
      phone: user.profile?.phone || null,
      location: user.profile?.location || null,
      joinDate: user.createdAt,
      bio: user.profile?.bio || null,
      avatarUrl: user.profile?.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || '')}`
    };
  },
  
  // Update user profile
  async updateProfile(userId: string, data: ProfileUpdateRequestType): Promise<ProfileResponseType> {
    loggerService.info(`Updating profile for user ID ${userId}`);
    
    // Get user
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true }
    });
    
    if (!user) {
      throw new Error('User not found');
    }
    
    // Update user name
    if (data.name) {
      await prisma.user.update({
        where: { id: userId },
        data: { name: data.name }
      });
    }
    
    // Update or create profile
    if (user.profile) {
      await prisma.userProfile.update({
        where: { userId },
        data: {
          organization: data.organization,
          phone: data.phone,
          location: data.location,
          bio: data.bio,
          avatarUrl: data.avatarUrl
        }
      });
    } else {
      await prisma.userProfile.create({
        data: {
          userId,
          organization: data.organization,
          phone: data.phone,
          location: data.location,
          bio: data.bio,
          avatarUrl: data.avatarUrl
        }
      });
    }
    
    // Get updated user
    const updatedUser = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: true,
        // Relation field name is unchanged by the Customer -> Organization
        // model rename — see the note at the top of schema.prisma.
        customer: true,
        profile: true
      }
    });

    if (!updatedUser) {
      throw new Error('User not found');
    }

    // Return updated profile
    return {
      id: updatedUser.id,
      name: updatedUser.name || '',
      email: updatedUser.email,
      role: updatedUser.role.name,
      organization: updatedUser.customer.name,
      phone: updatedUser.profile?.phone || null,
      location: updatedUser.profile?.location || null,
      joinDate: updatedUser.createdAt,
      bio: updatedUser.profile?.bio || null,
      avatarUrl: updatedUser.profile?.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(updatedUser.name || '')}`
    };
  },
  
  // Get user settings
  async getSettings(userId: string): Promise<SettingsResponseType> {
    loggerService.info(`Fetching settings for user ID ${userId}`);
    
    // Get user with settings
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        settings: true
      }
    });
    
    if (!user) {
      throw new Error('User not found');
    }
    
    // Return user settings
    return {
      id: user.id,
      notifications: (user.settings?.notifications as any) || {
        email: true,
        browser: true,
        mobile: false
      },
      twoFactorEnabled: user.settings?.twoFactorEnabled || false
    };
  },
  
  // Update user settings
  async updateSettings(userId: string, data: SettingsUpdateRequestType): Promise<SettingsResponseType> {
    loggerService.info(`Updating settings for user ID ${userId}`);
    
    // Get user
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { settings: true }
    });
    
    if (!user) {
      throw new Error('User not found');
    }
    
    // Update or create settings.
    // SECURITY: `twoFactorEnabled` is deliberately NOT writable here — 2FA
    // state only changes through the code-verified endpoints in
    // module/auth/two-factor.service.ts (enabling without a verified secret
    // would lock the user out at login; disabling without a TOTP code would
    // be a second-factor bypass). Any `twoFactorEnabled` field in the request
    // body is ignored.
    if (user.settings) {
      await prisma.userSettings.update({
        where: { userId },
        data: {
          notifications: data.notifications
        }
      });
    } else {
      await prisma.userSettings.create({
        data: {
          userId,
          notifications: data.notifications || {
            email: true,
            browser: true,
            mobile: false
          }
        }
      });
    }
    
    // Get updated settings
    const updatedUser = await prisma.user.findUnique({
      where: { id: userId },
      include: { settings: true }
    });
    
    if (!updatedUser) {
      throw new Error('User not found');
    }
    
    // Return updated settings
    return {
      id: updatedUser.id,
      notifications: (updatedUser.settings?.notifications as any) || {
        email: true,
        browser: true,
        mobile: false
      },
      twoFactorEnabled: updatedUser.settings?.twoFactorEnabled || false
    };
  }
};
