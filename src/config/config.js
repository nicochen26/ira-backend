const config = {
  development: {
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  production: {
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'production',
  },
  test: {
    port: process.env.PORT || 3001,
    nodeEnv: process.env.NODE_ENV || 'test',
  }
};

const currentEnv = process.env.NODE_ENV || 'development';

module.exports = config[currentEnv];