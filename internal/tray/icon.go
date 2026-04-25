package tray

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
)

// GenerateIcon creates a 64x64 PNG icon for the system tray:
// a rounded blue-to-indigo gradient square with a white terminal
// prompt chevron (">") and underscore ("_").
func GenerateIcon() []byte {
	const size = 64
	img := image.NewRGBA(image.Rect(0, 0, size, size))

	blue1 := color.RGBA{R: 59, G: 130, B: 246, A: 255}
	blue2 := color.RGBA{R: 99, G: 102, B: 241, A: 255}
	white := color.RGBA{R: 255, G: 255, B: 255, A: 255}
	transparent := color.RGBA{R: 0, G: 0, B: 0, A: 0}

	radius := 12.0

	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			if !inRoundedRect(x, y, size, size, radius) {
				img.Set(x, y, transparent)
				continue
			}
			t := (float64(x) + float64(y)) / float64(2*size)
			r := lerp(float64(blue1.R), float64(blue2.R), t)
			g := lerp(float64(blue1.G), float64(blue2.G), t)
			b := lerp(float64(blue1.B), float64(blue2.B), t)
			img.Set(x, y, color.RGBA{R: uint8(r), G: uint8(g), B: uint8(b), A: 255})
		}
	}

	// Draw ">" chevron — thick 3px lines
	// Top arm: (12,16) → (30,31)
	// Bottom arm: (12,46) → (30,31)
	for w := -1; w <= 1; w++ {
		drawLine(img, 12, 16+w, 30, 31+w, white, size, radius)
		drawLine(img, 12, 46+w, 30, 31+w, white, size, radius)
	}

	// Draw "_" underscore: thick bar from x=34 to x=52 at y=46, 3px tall
	for dy := -1; dy <= 1; dy++ {
		for x := 34; x <= 52; x++ {
			if inRoundedRect(x, 46+dy, size, size, radius) {
				img.Set(x, 46+dy, white)
			}
		}
	}

	var buf bytes.Buffer
	_ = png.Encode(&buf, img)
	return buf.Bytes()
}

func inRoundedRect(x, y, w, h int, r float64) bool {
	fx, fy := float64(x), float64(y)
	fw, fh := float64(w), float64(h)

	if fx >= r && fx <= fw-r {
		return true
	}
	if fy >= r && fy <= fh-r {
		return true
	}

	// Check corners
	corners := [][2]float64{
		{r, r},
		{fw - r, r},
		{r, fh - r},
		{fw - r, fh - r},
	}
	for _, c := range corners {
		dx := fx - c[0]
		dy := fy - c[1]
		if dx*dx+dy*dy <= r*r {
			return true
		}
	}
	return false
}

func drawLine(img *image.RGBA, x0, y0, x1, y1 int, c color.RGBA, size int, radius float64) {
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
		if x0 >= 0 && x0 < size && y0 >= 0 && y0 < size && inRoundedRect(x0, y0, size, size, radius) {
			img.Set(x0, y0, c)
		}
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

func lerp(a, b, t float64) float64 {
	return a + (b-a)*t
}

func abs(x int) int {
	if x < 0 {
		return -x
	}
	return x
}

