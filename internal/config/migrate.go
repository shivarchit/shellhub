package config

import (
	"os"

	"gopkg.in/yaml.v3"
)

// YAMLConfig is used only for importing from YAML.
type YAMLConfig struct {
	Servers []Server `yaml:"servers"`
}

// ImportFromYAML imports servers from a YAML file into the store.
// It only imports if the YAML file exists and the DB has no servers yet.
// Returns the number of servers imported.
func ImportFromYAML(store *Store, yamlPath string) (int, error) {
	if _, err := os.Stat(yamlPath); os.IsNotExist(err) {
		return 0, nil
	}

	existing, err := store.GetServers()
	if err != nil {
		return 0, err
	}
	if len(existing) > 0 {
		return 0, nil
	}

	data, err := os.ReadFile(yamlPath)
	if err != nil {
		return 0, err
	}

	var cfg YAMLConfig
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return 0, err
	}

	for _, srv := range cfg.Servers {
		if _, err := store.AddServer(srv); err != nil {
			return 0, err
		}
	}

	return len(cfg.Servers), nil
}
