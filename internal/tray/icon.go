package tray

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
)

// GenerateIcon creates a 32x32 PNG icon: a blue square with a white
// terminal-prompt chevron (">_") for use as the system-tray icon.
func GenerateIcon() []byte {
	const size = 32
	img := image.NewRGBA(image.Rect(0, 0, size, size))

	blue := color.RGBA{R: 59, G: 130, B: 246, A: 255}
	white := color.RGBA{R: 255, G: 255, B: 255, A: 255}

	// Fill background with blue
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			img.Set(x, y, blue)
		}
	}

	// Draw ">" chevron (lines from top-left to middle-right, then back)
	// Top stroke of chevron: (6,8) -> (16,15)
	drawLine(img, 6, 8, 16, 15, white)
	drawLine(img, 6, 9, 16, 16, white)
	// Bottom stroke of chevron: (6,23) -> (16,16)
	drawLine(img, 6, 23, 16, 16, white)
	drawLine(img, 6, 22, 16, 15, white)

	// Draw "_" underscore cursor: horizontal line from x=18 to x=26 at y=23
	for x := 18; x <= 26; x++ {
		img.Set(x, 23, white)
		img.Set(x, 22, white)
	}

	var buf bytes.Buffer
	_ = png.Encode(&buf, img)
	return buf.Bytes()
}

// drawLine uses Bresenham's algorithm to draw a 1px line between two points.
func drawLine(img *image.RGBA, x0, y0, x1, y1 int, c color.RGBA) {
	dx := abs(x1 - x0)
	dy := -abs(y1 - y0)
	sx := 1
	if x0 > x1 {
		sx = -1
	}
	sy := 1
	if y0 > y1 {
		sy = -1
	}
	err := dx + dy

	for {
		img.Set(x0, y0, c)
		if x0 == x1 && y0 == y1 {
			break
		}
		e2 := 2 * err
		if e2 >= dy {
			err += dy
			x0 += sx
		}
		if e2 <= dx {
			err += dx
			y0 += sy
		}
	}
}

func abs(x int) int {
	if x < 0 {
		return -x
	}
	return x
}
