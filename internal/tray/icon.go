package tray

import (
	"bytes"
	"encoding/binary"
	"image"
	"image/color"
	"image/png"
	"math"
	"runtime"
)

// GenerateIcon creates the system tray icon.
// Returns ICO format on Windows, PNG on other platforms.
func GenerateIcon() []byte {
	img := generateImage(64)

	if runtime.GOOS == "windows" {
		return pngToICO(img)
	}

	var buf bytes.Buffer
	_ = png.Encode(&buf, img)
	return buf.Bytes()
}

// generateImage renders the "F — Stack & Prompt" mark simplified for the tray:
// dark rounded badge, two server-rack slabs with status LEDs, and a green->blue
// prompt chevron with a dark outline. Vent bars are dropped at this size.
// Geometry is on the 32-unit grid, scaled by s = size/32.
func generateImage(size int) *image.RGBA {
	img := image.NewRGBA(image.Rect(0, 0, size, size))
	s := float64(size) / 32.0

	badge := color.RGBA{0x0b, 0x11, 0x20, 255}
	border := color.RGBA{0x25, 0x33, 0x45, 255}
	slabFill := color.RGBA{0x1a, 0x23, 0x32, 255}
	slabStroke := color.RGBA{0x2b, 0x3b, 0x55, 255}
	ledGreen := color.RGBA{0x22, 0xc5, 0x5e, 255}
	ledAmber := color.RGBA{0xf5, 0x9e, 0x0b, 255}
	green := color.RGBA{0x22, 0xc5, 0x5e, 255}
	blue := color.RGBA{0x3b, 0x82, 0xf6, 255}
	transparent := color.RGBA{0, 0, 0, 0}

	// Badge: rounded rect fill with a 1-unit inset border.
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			gx, gy := (float64(x)+0.5)/s, (float64(y)+0.5)/s
			switch {
			case inRR(gx, gy, 0.5, 0.5, 31, 31, 6.5) && !inRR(gx, gy, 1.5, 1.5, 29, 29, 5.5):
				img.Set(x, y, border)
			case inRR(gx, gy, 0, 0, 32, 32, 7):
				img.Set(x, y, badge)
			default:
				img.Set(x, y, transparent)
			}
		}
	}

	// Two server-rack slabs, each with a status LED.
	drawRoundRect(img, s, 5, 6, 17, 7.5, 2, slabFill, slabStroke)
	drawCircle(img, s, 8.6, 9.75, 1.4, ledGreen)
	drawRoundRect(img, s, 5, 16, 17, 7.5, 2, slabFill, slabStroke)
	drawCircle(img, s, 8.6, 19.75, 1.4, ledAmber)

	// Prompt chevron overlaid on top, green->blue gradient with a dark outline.
	chevron := [][2]float64{
		{15.5, 11}, {26.5, 18.2}, {15.5, 25.4},
		{15.5, 21.2}, {20.5, 18.2}, {15.5, 15.2},
	}
	gdx, gdy := 27.0-14.0, 22.0-10.0
	gl2 := gdx*gdx + gdy*gdy
	stroke := 0.6
	for y := int(9 * s); y <= int(27*s) && y < size; y++ {
		for x := int(14 * s); x <= int(28*s) && x < size; x++ {
			if x < 0 || y < 0 {
				continue
			}
			gx, gy := (float64(x)+0.5)/s, (float64(y)+0.5)/s
			if distToPoly(gx, gy, chevron) <= stroke {
				img.Set(x, y, badge)
				continue
			}
			if inPoly(gx, gy, chevron) {
				t := ((gx-14)*gdx + (gy-10)*gdy) / gl2
				if t < 0 {
					t = 0
				} else if t > 1 {
					t = 1
				}
				img.Set(x, y, color.RGBA{
					uint8(lerp(float64(green.R), float64(blue.R), t)),
					uint8(lerp(float64(green.G), float64(blue.G), t)),
					uint8(lerp(float64(green.B), float64(blue.B), t)),
					255,
				})
			}
		}
	}

	return img
}

// drawRoundRect fills a grid-unit rounded rect with a 1-unit centered stroke.
func drawRoundRect(img *image.RGBA, s, x, y, w, h, r float64, fill, stroke color.RGBA) {
	size := img.Bounds().Dx()
	for py := int(y * s); py <= int((y+h)*s) && py < size; py++ {
		for px := int(x * s); px <= int((x+w)*s) && px < size; px++ {
			if px < 0 || py < 0 {
				continue
			}
			gx, gy := (float64(px)+0.5)/s, (float64(py)+0.5)/s
			switch {
			case inRR(gx, gy, x+0.5, y+0.5, w-1, h-1, r-0.5):
				img.Set(px, py, fill)
			case inRR(gx, gy, x-0.5, y-0.5, w+1, h+1, r+0.5):
				img.Set(px, py, stroke)
			}
		}
	}
}

func drawCircle(img *image.RGBA, s, cx, cy, r float64, c color.RGBA) {
	size := img.Bounds().Dx()
	for py := int((cy - r) * s); py <= int((cy+r)*s) && py < size; py++ {
		for px := int((cx - r) * s); px <= int((cx+r)*s) && px < size; px++ {
			if px < 0 || py < 0 {
				continue
			}
			gx, gy := (float64(px)+0.5)/s, (float64(py)+0.5)/s
			if dx, dy := gx-cx, gy-cy; dx*dx+dy*dy <= r*r {
				img.Set(px, py, c)
			}
		}
	}
}

// inRR reports whether (gx,gy) lies inside the rounded rect at (x,y,w,h,r).
func inRR(gx, gy, x, y, w, h, r float64) bool {
	if r < 0 {
		r = 0
	}
	if gx < x || gx > x+w || gy < y || gy > y+h {
		return false
	}
	cx := clamp(gx, x+r, x+w-r)
	cy := clamp(gy, y+r, y+h-r)
	dx, dy := gx-cx, gy-cy
	return dx*dx+dy*dy <= r*r
}

// inPoly reports whether (gx,gy) is inside the polygon via crossing number.
func inPoly(gx, gy float64, poly [][2]float64) bool {
	in := false
	n := len(poly)
	for i, j := 0, n-1; i < n; j, i = i, i+1 {
		xi, yi := poly[i][0], poly[i][1]
		xj, yj := poly[j][0], poly[j][1]
		if (yi > gy) != (yj > gy) &&
			gx < (xj-xi)*(gy-yi)/(yj-yi)+xi {
			in = !in
		}
	}
	return in
}

// distToPoly returns the distance from (gx,gy) to the polygon's boundary.
func distToPoly(gx, gy float64, poly [][2]float64) float64 {
	n := len(poly)
	d := math.MaxFloat64
	for i, j := 0, n-1; i < n; j, i = i, i+1 {
		if e := distSeg(gx, gy, poly[j][0], poly[j][1], poly[i][0], poly[i][1]); e < d {
			d = e
		}
	}
	return d
}

// distSeg returns the distance from point (px,py) to segment (ax,ay)-(bx,by).
func distSeg(px, py, ax, ay, bx, by float64) float64 {
	dx, dy := bx-ax, by-ay
	l2 := dx*dx + dy*dy
	if l2 == 0 {
		return math.Hypot(px-ax, py-ay)
	}
	t := ((px-ax)*dx + (py-ay)*dy) / l2
	if t < 0 {
		t = 0
	} else if t > 1 {
		t = 1
	}
	return math.Hypot(px-(ax+t*dx), py-(ay+t*dy))
}

func clamp(v, lo, hi float64) float64 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

func lerp(a, b, t float64) float64 {
	return a + (b-a)*t
}

// pngToICO wraps a single PNG image in ICO container format.
// Windows systray requires ICO format.
func pngToICO(img *image.RGBA) []byte {
	var pngBuf bytes.Buffer
	_ = png.Encode(&pngBuf, img)
	pngData := pngBuf.Bytes()

	bounds := img.Bounds()
	w := bounds.Dx()
	h := bounds.Dy()

	// ICO header: 6 bytes
	// ICO dir entry: 16 bytes
	// Then PNG data
	var ico bytes.Buffer

	// ICONDIR header
	binary.Write(&ico, binary.LittleEndian, uint16(0)) // reserved
	binary.Write(&ico, binary.LittleEndian, uint16(1)) // type: 1 = ICO
	binary.Write(&ico, binary.LittleEndian, uint16(1)) // count: 1 image

	// ICONDIRENTRY
	icoW := uint8(w)
	if w >= 256 {
		icoW = 0
	}
	icoH := uint8(h)
	if h >= 256 {
		icoH = 0
	}
	ico.WriteByte(icoW)                                           // width
	ico.WriteByte(icoH)                                           // height
	ico.WriteByte(0)                                              // color palette
	ico.WriteByte(0)                                              // reserved
	binary.Write(&ico, binary.LittleEndian, uint16(1))            // color planes
	binary.Write(&ico, binary.LittleEndian, uint16(32))           // bits per pixel
	binary.Write(&ico, binary.LittleEndian, uint32(len(pngData))) // data size
	binary.Write(&ico, binary.LittleEndian, uint32(22))           // data offset (6 + 16)

	ico.Write(pngData)

	return ico.Bytes()
}
