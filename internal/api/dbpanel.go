package api

import (
	"net/http"
	"strconv"
)

func (h *Handler) listTables(w http.ResponseWriter, r *http.Request) {
	rows, err := h.store.DB().Query(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	defer rows.Close()

	var tables []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			writeError(w, 500, err.Error())
			return
		}
		tables = append(tables, name)
	}
	if tables == nil {
		tables = []string{}
	}
	writeJSON(w, 200, tables)
}

func (h *Handler) queryTable(w http.ResponseWriter, r *http.Request) {
	table := r.URL.Query().Get("table")
	if table == "" {
		writeError(w, 400, "table parameter required")
		return
	}

	limitStr := r.URL.Query().Get("limit")
	limit := 100
	if limitStr != "" {
		if v, err := strconv.Atoi(limitStr); err == nil && v > 0 && v <= 1000 {
			limit = v
		}
	}

	offsetStr := r.URL.Query().Get("offset")
	offset := 0
	if offsetStr != "" {
		if v, err := strconv.Atoi(offsetStr); err == nil && v >= 0 {
			offset = v
		}
	}

	// Get total count
	var total int
	countRow := h.store.DB().QueryRow(`SELECT COUNT(*) FROM "` + table + `"`)
	if err := countRow.Scan(&total); err != nil {
		writeError(w, 500, err.Error())
		return
	}

	// Query rows
	rows, err := h.store.DB().Query(`SELECT * FROM "`+table+`" LIMIT ? OFFSET ?`, limit, offset)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	defer rows.Close()

	columns, err := rows.Columns()
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}

	var results []map[string]interface{}
	for rows.Next() {
		values := make([]interface{}, len(columns))
		valuePtrs := make([]interface{}, len(columns))
		for i := range values {
			valuePtrs[i] = &values[i]
		}

		if err := rows.Scan(valuePtrs...); err != nil {
			writeError(w, 500, err.Error())
			return
		}

		row := make(map[string]interface{})
		for i, col := range columns {
			val := values[i]
			if b, ok := val.([]byte); ok {
				row[col] = string(b)
			} else {
				row[col] = val
			}
		}
		results = append(results, row)
	}

	if results == nil {
		results = []map[string]interface{}{}
	}

	writeJSON(w, 200, map[string]interface{}{
		"columns": columns,
		"rows":    results,
		"total":   total,
	})
}
