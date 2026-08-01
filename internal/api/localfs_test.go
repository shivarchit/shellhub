package api

import (
	"encoding/json"
	"net/http/httptest"
	"testing"
)

func TestLocalFSRequiresSuperAdmin(t *testing.T) {
	_, mux := setupHandler(t)
	dir := t.TempDir()

	req := httptest.NewRequest("GET", "/api/localfs?path="+dir, nil)
	req.Header.Set("X-User-ID", "2")
	req.Header.Set("X-Username", "viewer")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != 403 {
		t.Fatalf("non-superadmin: expected 403, got %d: %s", rec.Code, rec.Body.String())
	}

	req = httptest.NewRequest("GET", "/api/localfs?path="+dir, nil)
	req.Header.Set("X-User-ID", "1")
	req.Header.Set("X-User-Role", "superadmin")
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("superadmin: expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var listing localListing
	json.Unmarshal(rec.Body.Bytes(), &listing)
	if listing.Path != dir {
		t.Fatalf("expected path %q, got %q", dir, listing.Path)
	}
}

func TestTransferProgressAccounting(t *testing.T) {
	var reg transferRegistry
	tr := reg.start("app.log", "pull", 10)
	pw := &progressWriter{&reg, tr}
	pw.Write(make([]byte, 4))
	pw.Write(make([]byte, 3))

	snap := reg.snapshot()
	if len(snap) != 1 || snap[0].Done != 7 || snap[0].Total != 10 || snap[0].Status != "active" {
		t.Fatalf("mid-transfer snapshot wrong: %+v", snap)
	}

	pw.Write(make([]byte, 3))
	reg.finish(tr, nil)
	if snap = reg.snapshot(); snap[0].Done != 10 || snap[0].Status != "done" {
		t.Fatalf("finished snapshot wrong: %+v", snap[0])
	}

	// Registry keeps only the most recent maxTransfers entries, newest first.
	for i := 0; i < maxTransfers+5; i++ {
		reg.start("f", "push", 1)
	}
	if snap = reg.snapshot(); len(snap) != maxTransfers {
		t.Fatalf("expected %d retained transfers, got %d", maxTransfers, len(snap))
	}
}
