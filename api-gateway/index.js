const express = require('express');
const Redis = require('ioredis');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// CRITICAL: Add JSON body parser
app.use(express.json());

const redis = new Redis(process.env.REDIS_URL || "redis://redis:6379");

// Health endpoint - GOOD
app.get('/health', async(req, res) => {
  try {
    await redis.ping();
    res.json({
      status: 'healthy',
      service: 'api-gateway',
      timestamp: new Date().toISOString(),
      redis: 'connected'
    });
  } catch(error) {
    res.status(500).json({
      status: 'unhealthy',
      service: 'api-gateway',
      timestamp: new Date().toISOString(),
      redis: 'disconnected'
    });
  }
});

// Root endpoint - GOOD
app.get('/', (req, res) => {
  res.json({
    message: 'ML Platform API Gateway',
    endpoints: [
      "/health", 
      "/test-redis", 
      "/api/predict", 
      "/api/process",
      "/api/services/status"
    ]
  });
});

// Redis test - GOOD
app.get("/test-redis", async(req, res) => {
  try {
    await redis.set("testkey", "hello its running");
    const value = await redis.get("testkey");
    res.json({
      status: "success",
      message: "Redis is working perfectly",
      data: value
    });
  } catch(error) {
    res.status(500).json({
      status: "error",
      message: "Failed to connect to Redis",
      error: error.message
    });
  }
});

// 🔴 FIXED: Rust inference endpoint
app.post("/api/infer", async (req, res) => {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    console.log(`📥 [${requestId}] Inference request received`);
    
    // FIX: Use service name, not localhost
    const response = await axios.post(
      "http://inference-engine:3001/infer",  // CHANGED FROM localhost:4000
      {
        ...req.body,
        request_id: requestId
      },
      {
        timeout: 10000,  // Increased from 1000ms
        headers: {
          "Content-Type": "application/json",
          "X-Request-ID": requestId
        }
      }
    );
    
    await redis.lpush('inference_logs', JSON.stringify({
      timestamp: new Date().toISOString(),
      request_id: requestId,
      input: req.body.input,
      success: true
    }));
    
    await redis.ltrim('inference_logs', 0, 99);
    
    res.json({
      ...response.data,
      gateway: 'api-gateway',
      forwarded: true,
      request_id: requestId
    });
    
  } catch (error) {
    console.error(`❌ [${requestId}] Inference error:`, error.message);
    
    res.status(500).json({
      error: "Inference engine failed",
      message: error.message,
      gateway: 'api-gateway',
      request_id: requestId
    });
  }
});

// 🔴 FIXED: Rust service check endpoint
app.get("/api/service/rust", async (req, res) => {  // Added async
  try {
    const response = await axios.get("http://inference-engine:3001/health", {  // FIXED URL
      timeout: 5000
    });
    
    res.json({
      rust_service: response.data,
      connected: true,
      status: "success"
    });
    
  } catch (error) {
    res.status(503).json({
      rust_service: 'unavailable',
      connected: false,
      error: error.message
    });
  }
});

// Week 1: NEW prediction endpoint (replaces old flow)
app.post('/api/predict', async (req, res) => {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  console.log(`📥 [${requestId}] Prediction request received`);
  
  try {
    // Step 1: Send to Go service for processing
    console.log(`   ↪️ [${requestId}] Sending to Go processor...`);
    
    const goResponse = await axios.post(
      'http://data-processor:3002/process',
      {
        ...req.body,
        request_id: requestId,
        timestamp: new Date().toISOString()
      },
      {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': requestId
        }
      }
    );
    
    console.log(`   ✅ [${requestId}] Go processing complete`);
    
    // Step 2: Send processed data to Rust for inference
    console.log(`   ↪️ [${requestId}] Sending to Rust inference...`);
    
    const rustResponse = await axios.post(
      'http://inference-engine:3001/infer',
      {
        data: goResponse.data.data || goResponse.data,
        request_id: requestId
      },
      {
        timeout: 15000,
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': requestId
        }
      }
    );
    
    console.log(`   ✅ [${requestId}] Rust inference complete`);
    
    // Step 3: Return combined response
    const response = {
      request_id: requestId,
      status: 'completed',
      pipeline: [
        {
          service: 'nodejs-gateway',
          action: 'request_received',
          timestamp: new Date().toISOString()
        },
        {
          service: 'go-processor',
          action: goResponse.data.action || 'data_processing',
          status: goResponse.data.status || 'processed',
          note: goResponse.data.note || 'Week 1 processing'
        },
        {
          service: 'rust-inference',
          action: 'ml_prediction',
          prediction: rustResponse.data.prediction,
          confidence: rustResponse.data.confidence || 0.85,
          processing_time_ms: rustResponse.data.processing_time_ms || 100
        }
      ],
      result: rustResponse.data.prediction,
      confidence: rustResponse.data.confidence || 0.85,
      total_processing_time_ms: Date.now() - parseInt(requestId.split('_')[1]),
      note: 'Week 1: Basic pipeline working! 3 languages communicating.',
      architecture: {
        languages: ['javascript', 'go', 'rust'],
        services: 3,
        flow: 'client → node → go → rust → node → client'
      }
    };
    
    // Log to Redis
    try {
      await redis.lpush('request_logs', JSON.stringify({
        request_id: requestId,
        timestamp: new Date().toISOString(),
        status: 'success',
        processing_time: response.total_processing_time_ms
      }));
      
      await redis.ltrim('request_logs', 0, 99);
    } catch (redisError) {
      console.error('Redis logging error:', redisError.message);
    }
    
    console.log(`   🎉 [${requestId}] Response sent to client`);
    res.json(response);
    
  } catch (error) {
    console.error(`❌ [${requestId}] Error:`, error.message);
    
    const errorResponse = {
      request_id: requestId,
      status: 'error',
      error: error.message,
      service: error.config?.url?.includes('data-processor') ? 'go' : 'rust',
      timestamp: new Date().toISOString(),
      note: 'Week 1: Basic pipeline - service communication failed'
    };
    
    res.status(500).json(errorResponse);
  }
});

// Go processing endpoint - KEEP THIS
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

// Service status endpoint - GOOD
app.get('/api/services/status', async (req, res) => {
  const services = {
    redis: { status: 'checking' },
    rust: { status: 'checking' },
    go: { status: 'checking' },
    node: { status: 'healthy' }
  };
  
  try {
    await redis.ping();
    services.redis = { status: 'connected', latency: Date.now() };
  } catch (error) {
    services.redis = { status: 'error', error: error.message };
  }
  
  try {
    const rustResponse = await axios.get('http://localhost:3001/health', {
      timeout: 5000
    });
    services.rust = { status: 'healthy', ...rustResponse.data };
  } catch (error) {
    services.rust = { status: 'error', error: error.message };
  }
  
  try {
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
  console.log(`API Gateway running on port ${PORT}`);
  console.log(`Redis URL: ${process.env.REDIS_URL || 'redis://redis:6379'}`);
  console.log('Available endpoints:');
  console.log('   GET  /health');
  console.log('   GET  /test-redis');
  console.log('   POST /api/predict    ← Week 1 main endpoint');
  console.log('   POST /api/process');
  console.log('   GET  /api/services/status');
});