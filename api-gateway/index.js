const express = require("express");
const Redis = require("ioredis");
const axios = require("axios");
const apiLimiter = require("./middleware");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(apiLimiter);
const redis = new Redis(process.env.REDIS_URL || "redis://redis:6379");

app.get("/health", async (req, res) => {
  try {
    await redis.ping();
    res.json({
      status: "healthy",
      service: "api-gateway",
      timestamp: new Date().toISOString(),
      redis: "connected",
    });
  } catch (error) {
    res.status(500).json({
      status: "unhealthy",
      service: "api-gateway",
      timestamp: new Date().toISOString(),
      redis: "disconnected",
    });
  }
});

app.get("/", (req, res) => {
  res.json({
    message: "ML Platform API Gateway",
    endpoints: [
      "/health",
      "/test-redis",
      "/api/predict",
      "/api/process",
      "/api/services/status",
      "/api/requests/:requestId",
    ],
  });
});

app.get("/test-redis", async (req, res) => {
  try {
    await redis.set("testkey", "hello its running");
    const value = await redis.get("testkey");
    res.json({
      status: "success",
      message: "Redis is working perfectly",
      data: value,
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to connect to Redis",
      error: error.message,
    });
  }
});

app.post("/api/infer", async (req, res) => {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    console.log(`[${requestId}] Inference request received`);

    const response = await axios.post(
      "http://inference-engine:3001/infer",
      {
        ...req.body,
        request_id: requestId,
      },
      {
        timeout: 10000,
        headers: {
          "Content-Type": "application/json",
          "X-Request-ID": requestId,
        },
      },
    );

    await redis.lpush(
      "inference_logs",
      JSON.stringify({
        timestamp: new Date().toISOString(),
        request_id: requestId,
        input: req.body.input,
        success: true,
      }),
    );

    await redis.ltrim("inference_logs", 0, 99);

    res.json({
      ...response.data,
      gateway: "api-gateway",
      forwarded: true,
      request_id: requestId,
    });
  } catch (error) {
    console.error(`[${requestId}] Inference error:`, error.message);

    res.status(500).json({
      error: "Inference engine failed",
      message: error.message,
      gateway: "api-gateway",
      request_id: requestId,
    });
  }
});

app.get("/api/service/rust", async (req, res) => {
  try {
    const response = await axios.get("http://inference-engine:3001/health", {
      timeout: 5000,
    });

    res.json({
      rust_service: response.data,
      connected: true,
      status: "success",
    });
  } catch (error) {
    res.status(503).json({
      rust_service: "unavailable",
      connected: false,
      error: error.message,
    });
  }
});

app.post("/api/predict", async (req, res) => {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  console.log(`[${requestId}] Prediction request received`);

  try {
    await redis.hset(`request:${requestId}`, {
      status: "queued",
      input: JSON.stringify(req.body),
      user_ip: req.ip,
      created_at: Date.now(),
      endpoint: "/api/predict",
    });

    await redis.lpush("queue:processing", requestId);

    console.log(`[${requestId}] Queued for processing`);
    const timeoutMs = 15000;
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const status = await redis.hget(`request:${requestId}`, "status");

      if (status === "completed") {
        const result = await redis.hget(`request:${requestId}`, "result");
        return res.json({
          status: "completed",
          result: JSON.parse(result),
        });
      }

      if (status === "failed") {
        const error = await redis.hget(`request:${requestId}`, "error");
        return res.status(500).json({ status: "failed", error });
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    res.json({
      status: "processing",
      message: "Still processing, poll later",
    });

    res.json({
      request_id: requestId,
      status: "queued",
      message: "Request accepted for processing",
      check_status: `/api/requests/${requestId}`,
      estimated_wait: "2-5 seconds",
    });
  } catch (error) {
    console.error(`[${requestId}] Queueing error:`, error.message);

    res.status(500).json({
      request_id: requestId,
      status: "error",
      error: "Failed to queue request",
      message: error.message,
    });
  }
});

app.get("/api/requests/:requestId", async (req, res) => {
  const { requestId } = req.params;

  try {
    const requestData = await redis.hgetall(`request:${requestId}`);

    if (!requestData || Object.keys(requestData).length === 0) {
      return res.status(404).json({
        error: "Request not found",
        request_id: requestId,
      });
    }

    const response = {
      request_id: requestId,
      status: requestData.status || "unknown",
      created_at: new Date(
        parseInt(requestData.created_at || Date.now()),
      ).toISOString(),
    };

    if (requestData.status === "completed" && requestData.result) {
      response.result = JSON.parse(requestData.result);
      response.completed_at = new Date(
        parseInt(requestData.completed_at),
      ).toISOString();
      response.processing_time_ms =
        parseInt(requestData.processing_time_ms) || 0;
    }

    if (requestData.status === "failed") {
      response.error = requestData.error;
      response.failed_service = requestData.failed_service;
      response.failed_at = new Date(
        parseInt(requestData.failed_at),
      ).toISOString();
    }

    response.pipeline = {
      go: requestData.go_status || "pending",
      rust: requestData.rust_status || "pending",
    };

    res.json(response);
  } catch (error) {
    res.status(500).json({
      error: "Failed to fetch request status",
      message: error.message,
    });
  }
});

app.post("/api/process", async (req, res) => {
  try {
    console.log("Sending data to Go processor");

    const response = await axios.post(
      "http://data-processor:3002/process",
      req.body,
      {
        timeout: 10000,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    await redis.lpush(
      "processing_requests",
      JSON.stringify({
        timestamp: new Date().toISOString(),
        data_points: req.body.data?.length || 0,
        service: "go",
      }),
    );

    res.json({
      ...response.data,
      gateway: "nodejs",
      forwarded: true,
    });
  } catch (error) {
    console.error("Processing error:", error.message);

    res.status(500).json({
      error: "Data processing service unavailable",
      message: error.message,
    });
  }
});

app.get("/api/services/status", async (req, res) => {
  const services = {
    redis: { status: "checking" },
    rust: { status: "checking" },
    go: { status: "checking" },
    node: { status: "healthy" },
  };

  try {
    await redis.ping();
    services.redis = { status: "connected", latency: Date.now() };
  } catch (error) {
    services.redis = { status: "error", error: error.message };
  }

  try {
    const rustResponse = await axios.get(
      "http://inference-engine:3001/health",
      {
        timeout: 5000,
      },
    );
    services.rust = { status: "healthy", ...rustResponse.data };
  } catch (error) {
    services.rust = { status: "error", error: error.message };
  }

  try {
    const goResponse = await axios.get("http://data-processor:3002/health", {
      timeout: 5000,
    });
    services.go = { status: "healthy", ...goResponse.data };
  } catch (error) {
    services.go = { status: "error", error: error.message };
  }

  res.json({
    timestamp: new Date().toISOString(),
    services,
    overall: Object.values(services).every(
      (s) => s.status === "healthy" || s.status === "connected",
    )
      ? "healthy"
      : "degraded",
  });
});

app.listen(PORT, () => {
  console.log(`API Gateway running on port ${PORT}`);
  console.log(`Redis URL: ${process.env.REDIS_URL || "redis://redis:6379"}`);
});
