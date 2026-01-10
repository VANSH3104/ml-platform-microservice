const express = require('express');
const Redis = require('ioredis');
const app = express()
const PORT = process.env.PORT || 3000
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
app.get('/health', async(req, res) => {
  try {
    await redis.ping();
    res.json({
      status: 'healthy',
      service: 'api-gateway',
      timestamp: new Date().toISOString(),
      redis: 'connected'
    })
  }
  catch(error) {
    res.status(500).json({
      status: 'unhealthy',
      service: 'api-gateway',
      timestamp: new Date().toISOString(),
      redis: 'disconnected'
    })
  }
});
app.get('/', (req, res) => {
  res.json({
    message: 'ml platform Api Gateway',
    endpoints: ["/health", "/test"]
  })
})
app.get("/test-redis", async(req, res) => {
  try {
    await redis.set("testkey", "hello its running");
    //retrive
    const value = await redis.get("testkey");
    res.json({
      status: "success",
      messsage: "Redis is working perfectly",
      data : value
    })
  }
  catch(error) {
    res.status(500).json({
      status: "error",
      message: "Failed to connect to Redis",
      error: error.message
    });
  }
})
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Redis is connected at ${process.env.Redis_url || "redis://localhost:6379"}`);
})