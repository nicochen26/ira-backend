const dbClient = require('../db/client');

class UserService {
  async createUser(userData) {
    try {
      const prisma = dbClient.getClient();

      const { email, name } = userData;

      if (!email || !name) {
        throw new Error('Email and name are required');
      }

      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email }
      });

      if (existingUser) {
        throw new Error('User with this email already exists');
      }

      const user = await prisma.user.create({
        data: {
          email,
          name
        }
      });

      return user;
    } catch (error) {
      if (error.code === 'P2002') {
        throw new Error('User with this email already exists');
      }
      throw error;
    }
  }

  async getUserById(id) {
    try {
      const prisma = dbClient.getClient();

      if (!id) {
        throw new Error('User ID is required');
      }

      const user = await prisma.user.findUnique({
        where: { id }
      });

      if (!user) {
        throw new Error('User not found');
      }

      return user;
    } catch (error) {
      throw error;
    }
  }

  async getUserByEmail(email) {
    try {
      const prisma = dbClient.getClient();

      if (!email) {
        throw new Error('Email is required');
      }

      const user = await prisma.user.findUnique({
        where: { email }
      });

      if (!user) {
        throw new Error('User not found');
      }

      return user;
    } catch (error) {
      throw error;
    }
  }

  async updateUser(id, updateData) {
    try {
      const prisma = dbClient.getClient();

      if (!id) {
        throw new Error('User ID is required');
      }

      // First check if user exists
      const existingUser = await prisma.user.findUnique({
        where: { id }
      });

      if (!existingUser) {
        throw new Error('User not found');
      }

      // If email is being updated, check for conflicts
      if (updateData.email && updateData.email !== existingUser.email) {
        const emailExists = await prisma.user.findUnique({
          where: { email: updateData.email }
        });

        if (emailExists) {
          throw new Error('User with this email already exists');
        }
      }

      const user = await prisma.user.update({
        where: { id },
        data: updateData
      });

      return user;
    } catch (error) {
      if (error.code === 'P2002') {
        throw new Error('User with this email already exists');
      }
      if (error.code === 'P2025') {
        throw new Error('User not found');
      }
      throw error;
    }
  }

  async deleteUser(id) {
    try {
      const prisma = dbClient.getClient();

      if (!id) {
        throw new Error('User ID is required');
      }

      const user = await prisma.user.delete({
        where: { id }
      });

      return user;
    } catch (error) {
      if (error.code === 'P2025') {
        throw new Error('User not found');
      }
      throw error;
    }
  }

  async getAllUsers(limit = 50, offset = 0) {
    try {
      const prisma = dbClient.getClient();

      const users = await prisma.user.findMany({
        take: limit,
        skip: offset,
        orderBy: {
          createdAt: 'desc'
        }
      });

      const total = await prisma.user.count();

      return {
        users,
        total,
        limit,
        offset
      };
    } catch (error) {
      throw error;
    }
  }
}

module.exports = new UserService();