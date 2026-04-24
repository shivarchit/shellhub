package ssh

import (
	"io"

	gossh "golang.org/x/crypto/ssh"
)

type Session struct {
	client  *gossh.Client
	session *gossh.Session
	stdin   io.WriteCloser
	stdout  io.Reader
}

func NewSession(client *gossh.Client) (*Session, error) {
	sess, err := client.NewSession()
	if err != nil {
		return nil, err
	}
	stdin, err := sess.StdinPipe()
	if err != nil {
		sess.Close()
		return nil, err
	}
	stdout, err := sess.StdoutPipe()
	if err != nil {
		sess.Close()
		return nil, err
	}
	return &Session{
		client:  client,
		session: sess,
		stdin:   stdin,
		stdout:  stdout,
	}, nil
}

func (s *Session) RequestPty(cols, rows int) error {
	modes := gossh.TerminalModes{
		gossh.ECHO:          1,
		gossh.TTY_OP_ISPEED: 14400,
		gossh.TTY_OP_OSPEED: 14400,
	}
	return s.session.RequestPty("xterm-256color", rows, cols, modes)
}

func (s *Session) StartShell() error {
	return s.session.Shell()
}

func (s *Session) Resize(cols, rows int) error {
	return s.session.WindowChange(rows, cols)
}

func (s *Session) Write(p []byte) (int, error) {
	return s.stdin.Write(p)
}

func (s *Session) Read(p []byte) (int, error) {
	return s.stdout.Read(p)
}

func (s *Session) Close() error {
	if s.stdin != nil {
		s.stdin.Close()
	}
	if s.session != nil {
		s.session.Close()
	}
	if s.client != nil {
		s.client.Close()
	}
	return nil
}
