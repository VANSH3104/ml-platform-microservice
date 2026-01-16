package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/go-redis/redis/v8"
)
type App struct {
	RedisClient *redis.Client
}
type ProcessRequest struct {
	Data []float64 `json:"data"`
	Type string `json:"type"`
	Options map[string]interface{} `json:"options"`
}
type ProcessResponse struct {
	ProcessingData []float64 `json:"processing_data"`
	Steps []string `json:"steps"`
	Duration float64 `json:"duration"`
	Service string `json:"service"`
}
func healthCheck(w http.ResponseWriter, r *http.Request) {
	response := map[string]interface{}{
		"status": "healthy",
		"service": "data-processor",
		"language": "Go",
		"message": "Data processor is up and running",
	}
	w.Header().Set("content-type", "application/json")
	json.NewEncoder(w).Encode(response)
}
func newApp(redisAddress string) *App {
	rdb:= redis.NewClient(&redis.Options{
		Addr: redisAddress,
		Password: "",
		DB: 0,
	})
	return &App {
		RedisClient: rdb,
	}
}
func (app *App) healthHandler (w http.ResponseController , r *http.Request){
	ctx:= context.Background()
	//cheking redis connecton
	_ , err :=app.RedisClient.Ping(ctx).Result()
	if err := nill {
		http.Error(w, fmt.Sprintf("Redis error: %v", err), http.StatusServiceUnavailable)
		return
	}
	response:= map[string]interface{}{
		"status":      "healthy",
		"service":     "data-processor",
		"language":    "go",
		"timestamp":   time.Now().UTC(),
		"go_version":  "1.21",
		"redis":       "connected",
	}
	w.Header().set("content-type", "application/json")
	json.NewEncoder(w).Encode(response)
}
func (app *App) processHandler (w http.ResponseController , r *http.Request){
	start:= time.Now()
	var req ProcessingRequest
	if err:= json.NewDecoder(r.Body).Decode(&req); err != null {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	steps:= []string{"validate", "normalize", "cleaned"}
	processed := make([]float64, len(req.Data))
	// Simple processing: normalize data to 0-1 range
		maxVal := 0.0
		for _, val := range req.Data {
			if val > maxVal {
				maxVal = val
			}
		}
		
		if maxVal > 0 {
			for i, val := range req.Data {
				processed[i] = val / maxVal
			}
		} else {
			processed = req.Data
		}
		
		// Log to Redis
		ctx := context.Background()
		app.RedisClient.LPush(ctx, "data_processing_logs", fmt.Sprintf(
			"Processed %d values at %s",
			len(req.Data),
			time.Now().Format(time.RFC3339),
		))
	
		duration := time.Since(start).Seconds() * 1000
			
		response := ProcessResponse{
			ProcessedData: processed,
			Steps:         steps,
			Duration:      duration,
			Service:       "go-data-processor",
		}
		
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
}

func main(){
	app := NewApp("redis:6379")
		
		// HTTP server
		http.HandleFunc("/health", app.healthHandler)
		http.HandleFunc("/process", app.processHandler)
		http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			json.NewEncoder(w).Encode(map[string]interface{}{
				"service":   "data-processor",
				"endpoints": []string{"/health", "/process"},
				"language":  "go",
			})
		})
		
		// Start a background goroutine for metrics
		go app.collectMetrics()
		
		log.Println("🚀 Go Data Processor starting on port 3002")
		log.Fatal(http.ListenAndServe(":3002", nil))
}
func (app *App) collectMetrics() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	
	for range ticker.C {
		ctx := context.Background()
		app.RedisClient.HSet(ctx, "service_metrics:go", "last_alive", time.Now().Unix())
	}
}
