use actix_web::{App, HttpResponse, HttpServer, Responder, web};
use chrono::Utc;
use redis::Client;
use serde::{Deserialize, Serialize};
use std::time::SystemTime;
mod worker;
use worker::*;
#[derive(Deserialize)]
struct InferenceRequest {
    data: serde_json::Value,
    request_id: Option<String>,
}

#[derive(Serialize)]
struct InferenceResponse {
    status: String,
    service: String,
    prediction: serde_json::Value,
    confidence: f32,
    processing_time_ms: u128,
    request_id: Option<String>,
    note: String,
}

async fn health_check() -> impl Responder {
    HttpResponse::Ok().json(serde_json::json!({
        "status": "healthy",
        "service": "inference-engine",
        "language": "rust",
        "version": "1.0.0",
        "timestamp": Utc::now().to_rfc3339()
    }))
}

async fn infer(req: web::Json<InferenceRequest>) -> impl Responder {
    let start_time = SystemTime::now();
    
    // Week 1: Mock inference based on input type
    let prediction = match req.data.get("type").and_then(|t| t.as_str()) {
        Some("image") => serde_json::json!({
            "labels": ["cat", "dog", "bird"],
            "probabilities": [0.85, 0.10, 0.05],
            "top_label": "cat",
            "top_confidence": 0.85
        }),
        Some("text") => serde_json::json!({
            "sentiment": "positive",
            "score": 0.92,
            "language": "en"
        }),
        Some("audio") => serde_json::json!({
            "transcript": "hello world",
            "confidence": 0.95
        }),
        _ => serde_json::json!({
            "result": "mock_prediction",
            "details": "Week 1 mock inference",
            "input_received": req.data
        })
    };
    
    let processing_time = start_time.elapsed()
        .unwrap_or_default()
        .as_millis();
    
    HttpResponse::Ok().json(InferenceResponse {
        status: "success".to_string(),
        service: "rust-inference".to_string(),
        prediction,
        confidence: 0.85,
        processing_time_ms: processing_time,
        request_id: req.request_id.clone(),
        note: "Week 1: Mock inference. Real ML in Week 2.".to_string(),
    })
}

async fn test_redis() -> impl Responder {
    match Client::open("redis://redis:6379") {
        Ok(client) => match client.get_connection() {
            Ok(_) => HttpResponse::Ok().json(serde_json::json!({
                "status": "success",
                "message": "Redis connection successful",
                "service": "rust-inference"
            })),
            Err(err) => HttpResponse::ServiceUnavailable().json(serde_json::json!({
                "status": "error",
                "message": format!("Failed to connect to Redis: {}", err),
                "service": "rust-inference"
            })),
        },
        Err(e) => HttpResponse::ServiceUnavailable().json(serde_json::json!({
            "status": "error",
            "message": format!("Failed to create Redis client: {}", e),
            "service": "rust-inference"
        })),
    }
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::init_from_env(env_logger::Env::new().default_filter_or("info"));
    
    println!("Rust Inference Engine starting on port 3001");
    println!("Will connect to Redis at: redis://redis:6379");
    println!("Available endpoints:");
    println!("   GET  http://localhost:3001/");
    println!("   GET  http://localhost:3001/health");
    println!("   GET  http://localhost:3001/test-redis");
    println!("   POST http://localhost:3001/infer");
    if let Err(e) = start_processing_loop().await {
            eprintln!("Worker error: {}", e);
        }
    HttpServer::new(|| {
        App::new()
            .route("/health", web::get().to(health_check))
            .route("/test-redis", web::get().to(test_redis))
            .route("/infer", web::post().to(infer))
            .route("/", web::get().to(|| async {
                HttpResponse::Ok().json(serde_json::json!({
                    "service": "inference-engine",
                    "port": 3001,
                    "endpoints": ["/health", "/infer", "/test-redis"],
                    "language": "rust",
                    "week": 1,
                    "note": "Week 1: Mock inference service"
                }))
            }))
    })
    .bind("0.0.0.0:3001")?
    .workers(2)
    .run()
    .await
}