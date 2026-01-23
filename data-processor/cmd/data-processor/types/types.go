package types
type ProcessRequest struct {
	Data    interface{} `json:"data"`
	Type    string      `json:"type"`
	Options struct {
		Width   int `json:"width"`
		Height  int `json:"height"`
		Quality int `json:"quality"`
	} `json:"options"`
}