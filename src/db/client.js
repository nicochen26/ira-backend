const { PrismaClient } = require('@prisma/client');

class DatabaseClient {
  constructor() {
    this.prisma = null;
    this.isConnected = false;
    this.connectionAttempts = 0;
    this.maxRetries = 3;
    this.retryDelay = 1000;
  }

  async connect() {
    if (this.isConnected) {
      return this.prisma;
    }

    try {
      this.prisma = new PrismaClient({
        log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
        errorFormat: 'pretty',
      });

      await this.prisma.$connect();
      this.isConnected = true;
      this.connectionAttempts = 0;

      console.log('Database connected successfully');
      return this.prisma;
    } catch (error) {
      this.connectionAttempts++;
      console.error(`Database connection attempt ${this.connectionAttempts} failed:`, error.message);

      if (this.connectionAttempts < this.maxRetries) {
        console.log(`Retrying connection in ${this.retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        return this.connect();
      }

      throw new Error(`Failed to connect to database after ${this.maxRetries} attempts: ${error.message}`);
    }
  }

  async disconnect() {
    if (this.prisma && this.isConnected) {
      try {
        await this.prisma.$disconnect();
        this.isConnected = false;
        console.log('Database disconnected successfully');
      } catch (error) {
        console.error('Error disconnecting from database:', error.message);
      }
    }
  }

  async healthCheck() {
    try {
      if (!this.prisma || !this.isConnected) {
        return { status: 'disconnected', error: 'Not connected to database' };
      }

      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'healthy', timestamp: new Date().toISOString() };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  getClient() {
    if (!this.prisma || !this.isConnected) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return this.prisma;
  }

  async gracefulShutdown() {
    console.log('Shutting down database connection...');
    await this.disconnect();
  }
}

const dbClient = new DatabaseClient();

process.on('SIGINT', async () => {
  await dbClient.gracefulShutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await dbClient.gracefulShutdown();
  process.exit(0);
});

module.exports = dbClient;