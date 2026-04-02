const redis = require('redis');
require('dotenv').config();

const client = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});

client.on('error', (err) => {
  console.error('Redis Client Error:', err);
});

client.on('connect', () => {
  console.log('Redis Client Connected');
});

// Conectar ao Redis
const connectRedis = async () => {
  try {
    await client.connect();
  } catch (error) {
    console.error('Redis connection error:', error);
  }
};

connectRedis();

module.exports = client;
