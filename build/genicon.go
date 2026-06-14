package main

import (
	"flag"
	"image"
	"image/color"
	"image/png"
	"log"
	"os"
)

func main() {
	outPath := flag.String("out", "icon.png", "output file path")
	size := flag.Int("size", 512, "icon size (width and height)")
	flag.Parse()

	img := generateImage(*size)

	f, err := os.Create(*outPath)
	if err != nil {
		log.Fatalf("failed to create output file: %v", err)
	}
	defer f.Close()

	if err := png.Encode(f, img); err != nil {
		log.Fatalf("failed to encode png: %v", err)
	}

	log.Printf("Successfully generated %dx%d icon at %s", *size, *size, *outPath)
}

func generateImage(size int) *image.RGBA {
	img := image.NewRGBA(image.Rect(0, 0, size, size))

	blue1 := color.RGBA{R: 59, G: 130, B: 246, A: 255}
	blue2 := color.RGBA{R: 99, G: 102, B: 241, A: 255}
	white := color.RGBA{R: 255, G: 255, B: 255, A: 255}
	transparent := color.RGBA{R: 0, G: 0, B: 0, A: 0}

	radius := float64(size) / 5.0

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

	// Calculate line thickness proportional to size (using 64 size with 3px thick as base)
	thickness := size * 3 / 64
	if thickness < 1 {
		thickness = 1
	}
	halfThick := thickness / 2

	// ">" chevron
	cx, cy := size*6/32, size*8/32
	mx, my := size*16/32, size*16/32
	bx, by := size*6/32, size*24/32

	for w := -halfThick; w <= halfThick; w++ {
		drawLine(img, cx, cy+w, mx, my+w, white, size, radius)
		drawLine(img, bx, by+w, mx, my+w, white, size, radius)
	}

	// "_" underscore
	ux1, ux2, uy := size*18/32, size*26/32, size*24/32
	for dy := -halfThick; dy <= halfThick; dy++ {
		for x := ux1; x <= ux2; x++ {
			if inRoundedRect(x, uy+dy, size, size, radius) {
				img.Set(x, uy+dy, white)
			}
		}
	}

	return img
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
