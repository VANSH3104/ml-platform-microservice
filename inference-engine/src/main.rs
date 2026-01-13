use actix_web::{App, HttpResponse, HttpServer, Responder, web};
use chrono::Utc;
use redis::Client;
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
struct InferenceRequest {
    // input: Vec<f32>,
}

#[derive(Serialize)]
struct InferenceResponse {
    prediction: Vec<f32>,
    confidence: Vec<f32>,
    timestamp: String,
    status: String,
}

async fn health_check() -> impl Responder {
    HttpResponse::Ok().json(serde_json::json!({
        "status": "healthy",
        "service": "inference-engine",
        "language": "Rust",
        "version": env!("CARGO_PKG_VERSION")
    }))
}

async fn infer(_req: web::Json<InferenceRequest>) -> impl Responder {
    let mock_prediction = vec![0.1, 0.2, 0.3];
    let now = Utc::now();

    HttpResponse::Ok().json(InferenceResponse {
        prediction: mock_prediction.clone(),
        confidence: vec![0.9, 0.9, 0.9],
        timestamp: now.to_rfc3339(),
        status: "success".to_string(),
    })
}

async fn test_redis() -> impl Responder {
    match Client::open("redis://redis:6379") {
        Ok(client) => match client.get_connection() {
            Ok(_) => HttpResponse::Ok().json(serde_json::json!({
                "status": "success",
                "message": "Redis connection successful"
            })),
            Err(err) => HttpResponse::ServiceUnavailable().json(serde_json::json!({
                "status": "error",
                "message": format!("Failed to connect to Redis: {}", err)
            })),
        },
        Err(e) => HttpResponse::ServiceUnavailable().json(serde_json::json!({
            "status": "error",
            "message": format!("Failed to create Redis client: {}", e)
        })),
    }
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::init_from_env(env_logger::Env::new().default_filter_or("info"));
    println!("Rust Inference Engine starting on port 4000");
    println!("Will connect to Redis at: redis://redis:6379");

    HttpServer::new(|| {
        App::new()
            .route("/health", web::get().to(health_check))
            .route("/test-redis", web::get().to(test_redis))
            .route("/infer", web::post().to(infer))
            .route(
                "/",
                web::get().to(|| async {
                    HttpResponse::Ok().json(serde_json::json!({
                        "service": "inference-engine",
                        "endpoints": ["/health", "/infer", "/test-redis"],
                        "language": "rust"
                    }))
                }),
            )
    })
    .bind("0.0.0.0:4000")?
    .workers(2)
    .run()
    .await
}
