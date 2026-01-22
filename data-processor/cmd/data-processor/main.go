package main

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/VANSH3104/data-processor/cmd/data-processor/imageprocess"
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
func processHandler(w http.ResponseWriter, r *http.Request) {
	var req ProcessRequest
	log.Println("Processing image", req)
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if req.Type == "image" {
		log.Println("Processing image")
		if req.Options.Width == 0 || req.Options.Height == 0 || req.Options.Quality == 0 {
			http.Error(w, "invalid options", http.StatusBadRequest)
			return
		}
		url, ok := req.Data.(string)
		if !ok || url == "" {
			http.Error(w, "data must be image URL", http.StatusBadRequest)
			return
		}
		tensor, err := imageprocess.ImageToTensor(url)
		if err != nil {
			log.Println("ImageToTensor error:", err)
			http.Error(w, "error processing image", http.StatusInternalServerError)
			return
		}
		flatTensor := imageprocess.FlattenTensor(tensor)
		//send tensor to rust
		req.Data = flatTensor

	}
	response := ProcessResponse{
		Status:   "OK",
		Service:  "Data Processor",
		Action:   "Processed",
		Data:     req.Data,
		NextStep: "forword to rust",
		Note:     "Note",
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
func main() {
	port := ":3002"
	http.HandleFunc("/health", healthHandler)
	http.HandleFunc("/info", inforHandler)
	http.HandleFunc("/process", processHandler)

	log.Printf("   GET  http://localhost%s/", port)
	log.Printf("   GET  http://localhost%s/health", port)
	log.Printf("   GET  http://localhost%s/info", port)
	log.Printf("   POST http://localhost%s/process", port)
	log.Fatal(http.ListenAndServe(port, nil))
}
