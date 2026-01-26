package worker

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/VANSH3104/data-processor/cmd/data-processor/imageprocess"
	"github.com/VANSH3104/data-processor/cmd/data-processor/types"
)

var ctx = context.Background()

func StartRedisWorker() {
	rdb := redis.NewClient(&redis.Options{
		Addr: "redis:6379",
	})

	log.Println("Go worker connected to Redis")

	for {
		result, err := rdb.BRPop(ctx, 0, "queue:processing").Result()
		if err != nil {
			log.Println("BRPOP error:", err)
			time.Sleep(time.Second)
			continue
		}

		requestId := result[1]
		log.Println("Picked job:", requestId)

		processJob(rdb, requestId)
	}
}

func processJob(rdb *redis.Client, requestId string) {
	log.Println("Processing request:", requestId)

	// mark stage started
	rdb.HSet(ctx, "request:"+requestId, "go_status", "started")

	inputJSON, err := rdb.HGet(ctx, "request:"+requestId, "input").Result()
	if err != nil {
		failJob(rdb, requestId, "input not found")
		return
	}

	var req types.ProcessRequest
	if err := json.Unmarshal([]byte(inputJSON), &req); err != nil {
		failJob(rdb, requestId, "invalid json")
		return
	}

	if req.Type == "image" {
		url, ok := req.Data.(string)
		if !ok || url == "" {
			failJob(rdb, requestId, "invalid image url")
			return
		}

		tensor, err := imageprocess.ImageToTensor(url)
		if err != nil {
			failJob(rdb, requestId, "image processing failed")
			return
		}

		req.Data = imageprocess.FlattenTensor(tensor)
	}

	resultBytes, _ := json.Marshal(req.Data)

	rdb.HSet(ctx, "request:"+requestId, map[string]interface{}{
		"go_status": "completed",
		"status":    "Processed",
		"result":    string(resultBytes),
		"go_result": string(resultBytes),
		"go_time":   time.Now().Unix(),
	})

	rdb.RPush(ctx, "queue:rust_inference", requestId)
}

func failJob(rdb *redis.Client, requestId, reason string) {
	log.Println("Job failed:", requestId, reason)

	rdb.HSet(ctx, "request:"+requestId, map[string]interface{}{
		"go_status": "failed",
		"status":    "failed",
		"error":     reason,
	})
}
