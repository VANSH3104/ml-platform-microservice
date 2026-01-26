use redis::AsyncCommands;
use tch::{Tensor, Kind, CModule, Device};
use serde_json;

// 1. Essential Constants for ResNet
const MEAN: [f32; 3] = [0.485, 0.456, 0.406];
const STD: [f32; 3] = [0.229, 0.224, 0.225];

async fn run_resnet_worker() -> Result<(), Box<dyn std::error::Error>> {
    // 2. Setup Device (GPU/CPU) and Model
    let device = Device::cuda_if_available();
    println!("Using device: {:?}", device);
    
    // Try to load model - check for different formats
    let model = match CModule::load("resnet18.onnx") {
        Ok(m) => {
            println!("Loaded ONNX model");
            m
        }
        Err(e) => {
            println!("Failed to load ONNX model: {}, trying TorchScript...", e);
            CModule::load("resnet18.ot")?
        }
    };
    
    let mut model = model;
    model.set_device(device);
    model.set_eval(); // Put model in inference mode

    // 3. Setup Redis
    let client = redis::Client::open("redis://127.0.0.1:6379")?;
    let mut con = client.get_async_connection().await?;

    // Pre-create normalization tensors on the correct device
    let mean = Tensor::from_slice(&MEAN).view([1, 3, 1, 1]).to_device(device);
    let std = Tensor::from_slice(&STD).view([1, 3, 1, 1]).to_device(device);

    println!("Rust worker started on {:?}. Waiting for Go requests...", device);

    loop {
        // 4. Wait for job from Go
        let (_list, request_id): (String, String) = con.blpop("queue:rust_inference", 0).await?;
        let hash_key = format!("request:{}", request_id);
        
        // 5. Fetch and Deserialize
        let json_data: String = con.hget(&hash_key, "go_result").await?;
        let flat_data: Vec<f32> = serde_json::from_str(&json_data)?;

        // Check input size
        if flat_data.len() != 224 * 224 * 3 {
            eprintln!("Error: Expected {} floats, got {}", 224 * 224 * 3, flat_data.len());
            let _: () = con.hset(&hash_key, "status", "error: invalid input size").await?;
            continue;
        }

        // 6. Pre-process (HWC -> NCHW)
        let input_tensor = Tensor::from_slice(&flat_data)
            .view([224, 224, 3])
            .permute(&[2, 0, 1])
            .unsqueeze(0)
            .to_device(device)
            .to_kind(Kind::Float);

        let processed_input = (input_tensor - &mean) / &std;

        // 7. Inference
        let output = match tch::no_grad(|| {
            model.forward_ts(&[processed_input])
        }) {
            Ok(out) => out,
            Err(e) => {
                eprintln!("Inference error: {}", e);
                let _: () = con.hset(&hash_key, "status", format!("error: {}", e)).await?;
                continue;
            }
        };

        // 8. Post-process
        let probabilities = output.softmax(-1, Kind::Float);
        let class_id_tensor = probabilities.argmax(-1, false);
        let class_id = class_id_tensor.int64_value(&[0]);
        let confidence = probabilities.double_value(&[class_id as i64, 0]) * 100.0;

        println!("ID: {} | Class: {} | Confidence: {:.2}%", request_id, class_id, confidence);

        // 9. Update Redis
        let _: () = con.hset(&hash_key, "prediction_id", class_id).await?;
        let _: () = con.hset(&hash_key, "confidence", format!("{:.2}%", confidence)).await?;
        let _: () = con.hset(&hash_key, "status", "finished").await?;
    }
}
