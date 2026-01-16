const express = require('express');
const Redis = require('ioredis');
const axios = require('axios');
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
app.post("/api/infer", async (req, res) => {
  try {
    const response = await axios.post("http://localhost:4000/infer", req.body, {
      timeout: 1000,
      headers: {
        "Content-Type": "application/json"
      }
      });
    await redis.lpush('inference-engine', JSON.stringify({
      timestamp: new Date().toISOString(),
      input: req.body.input,
      success: true
    }));
    await redis.ltrim('inference-engine', 0, 99);
    res.json({
      ...response.data,
      gateway: 'api-gateway',
      forward: true
    });
  }
  catch (error) {
    console.error('inferience-engine', error.message);
    res.status(500).json({
      error: "inferience engine failed",
      message: error.message,
      gateway: 'api-gateway'
      
    });
  }
})
app.get("/api/service/rust" , (req, res) => {
  try {
    const response = axios.get("http://localhost:4000/health", {
      timeout: 5000
    });
    res.json({
      rust_service: response.data,
      connected: true,
      status: "success"
      
    })
  }
  catch (error) {
      res.status(503).json({
        rust_service: 'unavailable',
        connected: false,
        error: error.message
      });
    }
})
// Add new endpoint for data processing
app.post('/api/process', async (req, res) => {
  try {
    console.log('📤 Sending data to Go processor...');
    
    const response = await axios.post(
      'http://data-processor:3002/process',
      req.body,
      {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    
    // Log to Redis
    await redis.lpush('processing_requests', JSON.stringify({
      timestamp: new Date().toISOString(),
      data_points: req.body.data?.length || 0,
      service: 'go'
    }));
    
    res.json({
      ...response.data,
      gateway: 'nodejs',
      forwarded: true
    });
    
  } catch (error) {
    console.error('❌ Processing error:', error.message);
    
    res.status(500).json({
      error: 'Data processing service unavailable',
      message: error.message
    });
  }
});

// Add endpoint to check all services
app.get('/api/services/status', async (req, res) => {
  const services = {
    redis: { status: 'checking' },
    rust: { status: 'checking' },
    go: { status: 'checking' },
    node: { status: 'healthy' }
  };
  
  try {
    // Check Redis
    await redis.ping();
    services.redis = { status: 'connected', latency: Date.now() };
  } catch (error) {
    services.redis = { status: 'error', error: error.message };
  }
  
  try {
    // Check Rust
    const rustResponse = await axios.get('http://inference-engine:3001/health', {
      timeout: 5000
    });
    services.rust = { status: 'healthy', ...rustResponse.data };
  } catch (error) {
    services.rust = { status: 'error', error: error.message };
  }
  
  try {
    // Check Go
    const goResponse = await axios.get('http://data-processor:3002/health', {
      timeout: 5000
    });
    services.go = { status: 'healthy', ...goResponse.data };
  } catch (error) {
    services.go = { status: 'error', error: error.message };
  }
  
  res.json({
    timestamp: new Date().toISOString(),
    services,
    overall: Object.values(services).every(s => s.status === 'healthy' || s.status === 'connected') 
      ? 'healthy' 
      : 'degraded'
  });
});
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Redis is connected at ${process.env.Redis_url || "redis://localhost:6379"}`);
})