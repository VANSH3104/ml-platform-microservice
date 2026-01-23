package main

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/VANSH3104/data-processor/cmd/data-processor/worker"
)

type HealthResponse struct {
	Status    string    `json:"status"`
	Message   string    `json:"message"`
	Service   string    `json:"service"`
	TimeStamp time.Time `json:"timestamp"`
}

type ProcessRequest struct {
	Data    interface{} `json:"data"`
	Type    string      `json:"type,omitempty"`
	Options struct {
		Width   int `json:"width,omitempty"`
		Height  int `json:"height,omitempty"`
		Quality int `json:"quality,omitempty"`
	} `json:"options,omitempty"`
}

type ProcessResponse struct {
	Status   string      `json:"status"`
	Service  string      `json:"service"`
	Action   string      `json:"action"`
	Data     interface{} `json:"data,omitempty"`
	NextStep string      `json:"next_step"`
	Note     string      `json:"note"`
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	response := HealthResponse{
		Status:    "OK",
		Message:   "Service is running",
		Service:   "Data Processor",
		TimeStamp: time.Now(),
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
func inforHandler(w http.ResponseWriter, r *http.Request) {
	info := map[string]interface{}{
		"service":   "Data Processor",
		"language":  "Go",
		"endpoints": []string{"/health-data", "/infoData-service", "/process"},
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(info)
}
func main() {
	go worker.StartRedisWorker()
	port := ":3002"
	http.HandleFunc("/health", healthHandler)
	http.HandleFunc("/info", inforHandler)

	log.Printf("   GET  http://localhost%s/", port)
	log.Printf("   GET  http://localhost%s/health", port)
	log.Printf("   GET  http://localhost%s/info", port)
	log.Printf("   POST http://localhost%s/process", port)
	log.Fatal(http.ListenAndServe(port, nil))
}
