package ssh

import (
	"errors"
	"fmt"
	"net"
	"time"

	"github.com/shivarchit/shellhub/internal/config"
	gossh "golang.org/x/crypto/ssh"
)

type Client struct{}

func NewClient() *Client {
	return &Client{}
}

func (c *Client) Ping(host string, port int, timeout time.Duration) (bool, error) {
	conn, err := net.DialTimeout("tcp", fmt.Sprintf("%s:%d", host, port), timeout)
	if err != nil {
		return false, nil
	}
	conn.Close()
	return true, nil
}

func (c *Client) Execute(server config.Server, command string) (string, int, error) {
	client, err := c.Connect(server)
	if err != nil {
		return "", -1, err
	}
	defer client.Close()

	session, err := client.NewSession()
	if err != nil {
		return "", -1, err
	}
	defer session.Close()

	output, err := session.CombinedOutput(command)
	if err != nil {
		if exitErr, ok := err.(*gossh.ExitError); ok {
			return string(output), exitErr.ExitStatus(), nil
		}
		return string(output), -1, err
	}
	return string(output), 0, nil
}

func (c *Client) Connect(server config.Server) (*gossh.Client, error) {
	var authMethods []gossh.AuthMethod

	switch server.AuthType {
	case "key":
		signer, err := gossh.ParsePrivateKey([]byte(server.PrivateKey))
		if err != nil {
			// Encrypted keys need the passphrase, carried in the password field.
			var missing *gossh.PassphraseMissingError
			if errors.As(err, &missing) && server.Password != "" {
				signer, err = gossh.ParsePrivateKeyWithPassphrase([]byte(server.PrivateKey), []byte(server.Password))
			}
			if err != nil {
				return nil, fmt.Errorf("failed to parse private key: %w", err)
			}
		}
		authMethods = append(authMethods, gossh.PublicKeys(signer))
		if server.Password != "" {
			authMethods = append(authMethods, gossh.Password(server.Password))
		}
	default:
		authMethods = append(authMethods, gossh.Password(server.Password))
	}

	cfg := &gossh.ClientConfig{
		User:            server.Username,
		Auth:            authMethods,
		HostKeyCallback: gossh.InsecureIgnoreHostKey(),
		Timeout:         10 * time.Second,
	}
	addr := fmt.Sprintf("%s:%d", server.Host, server.Port)
	return gossh.Dial("tcp", addr, cfg)
}
