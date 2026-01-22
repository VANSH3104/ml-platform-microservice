package imageprocess

import (
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"net/http"
	"time"

	"github.com/nfnt/resize"
)

const (
	Width  = 224
	Height = 224
)

func ImageToTensor(url string) ([][][]float32, error) {
	client := http.Client{
		Timeout: 10 * time.Second,
	}

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
			return nil, err
	}
	
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; DataProcessor/1.0)")
	
	resp, err := client.Do(req)
	if err != nil {
			return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("bad response status: %s", resp.Status)
	}

	img, _, err := image.Decode(resp.Body)
	if err != nil {
		return nil, err
	}

	resized := resize.Resize(Width, Height, img, resize.Bilinear)

	tensor := make([][][]float32, Height)
	for y := 0; y < Height; y++ {
		tensor[y] = make([][]float32, Width)
		for x := 0; x < Width; x++ {
			r, g, b, _ := resized.At(x, y).RGBA()

			tensor[y][x] = []float32{
				float32(r>>8) / 255.0,
				float32(g>>8) / 255.0,
				float32(b>>8) / 255.0,
			}
		}
	}

	return tensor, nil
}
func FlattenTensor(tensor [][][]float32) []float32 {
	flat := make([]float32, 0, Width*Height*3)

	for y := 0; y < Height; y++ {
		for x := 0; x < Width; x++ {
			flat = append(flat,
				tensor[y][x][0],
				tensor[y][x][1],
				tensor[y][x][2],
			)
		}
	}
	return flat
}
